import eventlet
from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
from math import sqrt
import time
import json
import os
import uuid
from datetime import datetime

eventlet.monkey_patch()

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Initialize MediaPipe
import mediapipe as mp

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
mp_drawing = mp.solutions.drawing_utils

# 眼睛关键点索引
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
LEFT_EYE = [362, 385, 387, 263, 373, 380]
MOUTH_OUTER = [
    61,
    185,
    40,
    39,
    37,
    0,
    267,
    269,
    270,
    409,
    291,
    375,
    321,
    405,
    314,
    17,
    84,
    181,
    91,
    146,
]
MOUTH_INNER = [
    78,
    95,
    88,
    178,
    87,
    14,
    317,
    402,
    318,
    324,
    308,
    415,
    310,
    311,
    312,
    13,
    82,
    81,
    80,
    191,
]


class BlinkDetector:
    def __init__(self):
        # 眨眼检测相关变量
        self.calibrating = True
        self.ratios = []
        self.min_ratio = float("inf")
        self.max_ratio = float("-inf")
        self.threshold = 0.3

        # 眨眼状态跟踪
        self.current_eye_state = "open"
        self.closed_start_time = None
        self.current_blink_min_ear = float("inf")
        self.blink_counter = 0
        self.total_blinks = 0

        # 新增左右眼检测
        self.left_blink_counter = 0
        self.right_blink_counter = 0
        self.left_total_blinks = 0
        self.right_total_blinks = 0
        self.left_eye_state = "open"
        self.right_eye_state = "open"

        # 数据记录
        self.game_active = False
        self.game_id = None
        self.data_dir = "blink_data"
        self.blink_records = []

        # 纯检测模式相关属性
        self.detection_active = False
        self.detection_start_time = None
        self.detection_stats = {
            "total_blinks": 0,
            "left_blinks": 0,
            "right_blinks": 0,
            "blink_details": [],  # 新增详细眨眼记录
        }
        # 创建数据目录
        os.makedirs(self.data_dir, exist_ok=True)

        # 图像增强
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def start_game(self, game_type):  # 添加 game_type 参数
        """开始新游戏会话"""
        self.game_active = True
        self.game_id = str(uuid.uuid4())
        self.game_type = game_type  # 记录游戏类型
        self.start_time = datetime.now()  # 记录游戏开始时间
        self.blink_records = []
        self.total_blinks = 0
        self.left_total_blinks = 0
        self.right_total_blinks = 0
        print(f"游戏开始: {self.game_id}, 模式: {game_type}")

    def end_game(self):
        """结束游戏并保存数据"""
        if not self.game_active:
            return None

        self.game_active = False
        end_time = datetime.now()  # 记录结束时间

        # 结算时统一处理眨眼类型和时长
        processed_blinks = []
        prev_time = None
        for rec in self.blink_records:
            ts = datetime.fromisoformat(rec["timestamp"])
            duration = (ts - prev_time).total_seconds() if prev_time else 0
            # 类型判断逻辑（可根据实际需求调整阈值）
            blink_type = (
                "full"
                if rec["min_ear"]
                < (self.min_ratio + (self.threshold - self.min_ratio) * 0.5)
                else "partial"
            )
            processed_blinks.append(
                {
                    **rec,
                    "duration": round(duration, 3),
                    "type": blink_type,
                }
            )
            prev_time = ts

        # 准备数据
        game_data = {
            "game_id": self.game_id,
            "game_type": self.game_type,  # 添加游戏类型
            "start_time": self.start_time.isoformat(),  # 添加开始时间
            "end_time": end_time.isoformat(),  # 添加结束时间
            "total_blinks": self.total_blinks,
            "left_total_blinks": self.left_total_blinks,
            "right_total_blinks": self.right_total_blinks,
            "blink_details": processed_blinks,  # 结算后详细信息
        }

        # 保存到文件
        filename = os.path.join(self.data_dir, f"blink_{self.game_id}.json")
        with open(filename, "w") as f:
            json.dump(game_data, f, indent=2)

        print(f"数据已保存到: {filename}")
        return game_data  # 返回完整数据

    def start_detection(self):
        """开始纯眨眼检测"""
        self.detection_active = True
        self.detection_start_time = time.time()
        self.detection_stats = {
            "total_blinks": 0,
            "left_blinks": 0,
            "right_blinks": 0,
            "blink_details": [],  # 初始化详细记录
        }
        print("纯眨眼检测开始")

        # 重置眨眼状态跟踪
        self.current_eye_state = "open"
        self.closed_start_time = None
        self.current_blink_min_ear = float("inf")
        self.blink_counter = 0
        self.left_blink_counter = 0
        self.right_blink_counter = 0
        self.left_eye_state = "open"
        self.right_eye_state = "open"

    def end_detection(self):
        """结束纯眨眼检测并返回结果"""
        if not self.detection_active:
            return None

        duration = time.time() - self.detection_start_time
        result = {
            **self.detection_stats,
            "duration": round(duration, 2),
            "timestamp": datetime.now().isoformat(),
        }

        # 处理眨眼细节数据
        processed_blinks = []
        prev_time = None
        for rec in self.detection_stats["blink_details"]:
            ts = datetime.fromisoformat(rec["timestamp"])
            duration = (ts - prev_time).total_seconds() if prev_time else 0
            blink_type = (
                "full"
                if rec["min_ear"]
                < (self.min_ratio + (self.threshold - self.min_ratio) * 0.5)
                else "partial"
            )
            processed_blinks.append(
                {
                    **rec,
                    "duration": round(duration, 3),
                    "type": blink_type,
                }
            )
            prev_time = ts

        # 添加处理后的眨眼细节
        result["blink_details"] = processed_blinks

        self.detection_active = False
        self.detection_start_time = None
        self.detection_stats = {
            "total_blinks": 0,
            "left_blinks": 0,
            "right_blinks": 0,
            "blink_details": [],
        }

        print(f"纯眨眼检测结束，结果: {result}")
        return result

    def _calculate_ear(self, landmarks, eye_points):
        """计算眼睛纵横比(EAR)"""

        def distance(p1, p2):
            return sqrt(
                (p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2 + (p2[2] - p1[2]) ** 2
            )

        # 垂直距离
        ver1 = distance(landmarks[eye_points[1]], landmarks[eye_points[5]])
        ver2 = distance(landmarks[eye_points[2]], landmarks[eye_points[4]])

        # 水平距离
        hor = distance(landmarks[eye_points[0]], landmarks[eye_points[3]])

        return (ver1 + ver2) / (2.0 * hor) if hor != 0 else 0

    def process_frame(self, frame):
        """处理视频帧"""
        # 图像预处理
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = self.clahe.apply(gray)
        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)

        results = face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            self.current_eye_state = "open"
            self.closed_start_time = None
            self.current_blink_min_ear_during_closure = float("inf")
            self.blink_counter = 0
            self.left_eye_state = "open"
            self.right_eye_state = "open"
            return

        for face_landmarks in results.multi_face_landmarks:
            landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
            left_ear = self._calculate_ear(landmarks, LEFT_EYE)
            right_ear = self._calculate_ear(landmarks, RIGHT_EYE)
            avg_ear = (left_ear + right_ear) / 2

            # Extract key points for visualization (eye and mouth landmarks)
            left_eye_points = [landmarks[i] for i in LEFT_EYE]
            right_eye_points = [landmarks[i] for i in RIGHT_EYE]
            mouth_outer = [landmarks[i] for i in MOUTH_OUTER]
            mouth_inner = [landmarks[i] for i in MOUTH_INNER]

            # Emit eye landmarks for frontend visualization
            socketio.start_background_task(
                lambda: socketio.emit(
                    "eye_landmarks",
                    {
                        "left_eye": left_eye_points,
                        "right_eye": right_eye_points,
                        "mouth_outer": mouth_outer,
                        "mouth_inner": mouth_inner,
                    },
                )
            )

            # 校准阶段
            if self.calibrating:
                self.min_ratio = min(self.min_ratio, avg_ear)
                self.max_ratio = max(self.max_ratio, avg_ear)
                self.ratios.append(avg_ear)

                if len(self.ratios) >= 100:
                    self.threshold = (
                        self.min_ratio + (self.max_ratio - self.min_ratio) * 0.4
                    )
                    self.calibrating = False
                    socketio.start_background_task(
                        lambda: socketio.emit(
                            "calibrated", {"threshold": self.threshold}
                        )
                    )
                continue

            # 整体眨眼检测
            if left_ear < self.threshold and right_ear < self.threshold:  # 眼睛闭合
                if self.current_eye_state != "closed":
                    self.current_eye_state = "closed"
                    self.closed_start_time = time.time()
                    self.current_blink_min_ear = avg_ear
                    socketio.start_background_task(
                        lambda: socketio.emit("eye_state", {"status": "closed"})
                    )
                else:
                    self.current_blink_min_ear = min(
                        self.current_blink_min_ear, avg_ear
                    )
                self.blink_counter += 1
            else:  # 眼睛睁开
                if self.current_eye_state == "closed":  # 眨眼结束
                    self.current_eye_state = "open"
                    socketio.start_background_task(
                        lambda: socketio.emit("eye_state", {"status": "open"})
                    )

                    if (
                        self.blink_counter > 2 and self.closed_start_time is not None
                    ):  # 有效眨眼
                        # 只记录最小信息，类型和duration结算时再处理
                        if self.game_active:
                            self.blink_records.append(
                                {
                                    "timestamp": datetime.now().isoformat(),
                                    "min_ear": round(self.current_blink_min_ear, 4),
                                    "avg_ear": round(avg_ear, 4),
                                }
                            )
                        self.total_blinks += 1
                        socketio.start_background_task(
                            lambda: socketio.emit(
                                "blink_event", {"total": self.total_blinks}
                            )
                        )

                    self.blink_counter = 0
                    self.current_blink_min_ear = float("inf")

            # 左眼眨眼检测
            if left_ear < self.threshold and right_ear > self.threshold:
                self.left_blink_counter += 1
                if self.left_eye_state != "closed":
                    self.left_eye_state = "closed"
                    socketio.start_background_task(
                        lambda: socketio.emit("left_eye_state", {"status": "closed"})
                    )
            else:
                if self.left_blink_counter > 2 and self.left_blink_counter < 14:
                    self.left_total_blinks += 1
                    socketio.start_background_task(
                        lambda: socketio.emit(
                            "left_blink_event", {"total": self.left_total_blinks}
                        )
                    )
                self.left_blink_counter = 0
                if self.left_eye_state != "open":
                    self.left_eye_state = "open"
                    socketio.start_background_task(
                        lambda: socketio.emit("left_eye_state", {"status": "open"})
                    )

            # 右眼眨眼检测
            if right_ear < self.threshold and left_ear > self.threshold:
                self.right_blink_counter += 1
                if self.right_eye_state != "closed":
                    self.right_eye_state = "closed"
                    socketio.start_background_task(
                        lambda: socketio.emit("right_eye_state", {"status": "closed"})
                    )
            else:
                if self.right_blink_counter > 2 and self.right_blink_counter < 14:
                    self.right_total_blinks += 1
                    socketio.start_background_task(
                        lambda: socketio.emit(
                            "right_blink_event", {"total": self.right_total_blinks}
                        )
                    )
                self.right_blink_counter = 0
                if self.right_eye_state != "open":
                    self.right_eye_state = "open"
                    socketio.start_background_task(
                        lambda: socketio.emit("right_eye_state", {"status": "open"})
                    )

            socketio.start_background_task(
                lambda: socketio.emit("ear_value", {"value": avg_ear})
            )

    def process_frame_for_detection(self, frame):
        """纯检测模式专用的帧处理方法"""
        # 图像预处理
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = self.clahe.apply(gray)
        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)

        results = face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            # 重置状态
            self._reset_eye_states()
            return

        for face_landmarks in results.multi_face_landmarks:
            landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
            left_ear = self._calculate_ear(landmarks, LEFT_EYE)
            right_ear = self._calculate_ear(landmarks, RIGHT_EYE)
            avg_ear = (left_ear + right_ear) / 2

            # 整体眨眼检测
            if left_ear < self.threshold and right_ear < self.threshold:
                if self.current_eye_state != "closed":
                    self.current_eye_state = "closed"
                    self.closed_start_time = time.time()
                    self.current_blink_min_ear = avg_ear
                else:
                    self.current_blink_min_ear = min(
                        self.current_blink_min_ear, avg_ear
                    )
                self.blink_counter += 1
            else:
                if self.current_eye_state == "closed":
                    self.current_eye_state = "open"
                    if self.blink_counter > 2:  # 有效眨眼
                        self._record_blink(avg_ear)
                    self.blink_counter = 0
                    self.current_blink_min_ear = float("inf")

            # 左眼眨眼检测
            if left_ear < self.threshold and right_ear > self.threshold:
                self.left_blink_counter += 1
                if self.left_eye_state != "closed":
                    self.left_eye_state = "closed"
            else:
                if self.left_blink_counter > 2 and self.left_blink_counter < 14:
                    self.detection_stats["left_blinks"] += 1
                    self.detection_stats["total_blinks"] += 1
                self.left_blink_counter = 0
                if self.left_eye_state != "open":
                    self.left_eye_state = "open"

            # 右眼眨眼检测
            if right_ear < self.threshold and left_ear > self.threshold:
                self.right_blink_counter += 1
                if self.right_eye_state != "closed":
                    self.right_eye_state = "closed"
            else:
                if self.right_blink_counter > 2 and self.right_blink_counter < 14:
                    self.detection_stats["right_blinks"] += 1
                    self.detection_stats["total_blinks"] += 1
                self.right_blink_counter = 0
                if self.right_eye_state != "open":
                    self.right_eye_state = "open"

    def _reset_eye_states(self):
        """重置所有眼睛状态"""
        self.current_eye_state = "open"
        self.closed_start_time = None
        self.current_blink_min_ear = float("inf")
        self.blink_counter = 0
        self.left_eye_state = "open"
        self.right_eye_state = "open"
        self.left_blink_counter = 0
        self.right_blink_counter = 0

    def _record_blink(self, current_ear):
        """记录一次眨眼"""
        blink_record = {
            "timestamp": datetime.now().isoformat(),
            "min_ear": round(self.current_blink_min_ear, 4),
            "avg_ear": round(current_ear, 4),
        }
        self.detection_stats["blink_details"].append(blink_record)
        self.detection_stats["total_blinks"] += 1


detector = BlinkDetector()


@socketio.on("frame")
def handle_frame(data):
    try:
        # 解析图像数据
        if hasattr(data, "read"):
            image_data = data.read()
        else:
            image_data = data
        img = Image.open(BytesIO(image_data))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        # 根据当前模式选择处理方法
        if detector.detection_active:
            # 纯检测模式处理
            detector.process_frame_for_detection(frame)
        elif detector.game_active:
            # 游戏模式处理
            detector.process_frame(frame)
    except Exception as e:
        print("[ERROR] Frame processing failed:", e)
        # 发送错误通知到前端
        socketio.start_background_task(
            lambda: socketio.emit("frame_error", {"message": str(e)})
        )


@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    detector.calibrating = True
    detector.ratios = []
    detector.min_ratio = float("inf")
    detector.max_ratio = float("-inf")
    return {"status": "calibrating"}


@socketio.on("start_game")
def handle_start_game(data):  # 添加 data 参数
    game_type = data.get("game_type", "classic")  # 获取游戏类型
    detector.start_game(game_type)
    return {
        "status": "game_started",
        "game_id": detector.game_id,
        "game_type": game_type,
    }


# 修改 handle_end_game 事件处理器
@socketio.on("end_game")
def handle_end_game():
    game_data = detector.end_game()
    if game_data is None:
        return {"status": "error", "message": "no active game"}

    return {"status": "game_ended", "game_data": game_data}  # 返回完整游戏数据


@socketio.on("start_detection")
def handle_start_detection():
    detector.start_detection()
    return {"status": "detection_started"}


@socketio.on("end_detection")
def handle_end_detection():
    result = detector.end_detection()
    if result is None:
        return {"status": "error", "message": "detection not active"}
    return {"status": "detection_ended", "data": result}


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)
