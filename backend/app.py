from flask import Flask, Response, render_template, request
import cv2
import mediapipe as mp
from math import sqrt
from flask_cors import CORS
from flask_socketio import SocketIO

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

socketio = SocketIO(app, cors_allowed_origins="*")

mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands
mp_face_mesh = mp.solutions.face_mesh

hands = mp_hands.Hands(static_image_mode=False, max_num_hands=4, min_detection_confidence=0.5, min_tracking_confidence=0.5)
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=2, min_detection_confidence=0.5, min_tracking_confidence=0.5)

# 眼部关键点索引（常用的EAR点）
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

COUNTER = 0
TOTAL_BLINKS = 0
STREAMING = False

def euclidean_distance(p1, p2):
    # 3D 距离
    x1, y1, z1 = p1
    x2, y2, z2 = p2
    return sqrt((x2 - x1)**2 + (y2 - y1)**2 + (z2 - z1)**2)

def blink_ratio(landmarks, eye_points):
    # 水平距离（眼角-眼角）
    hor_distance = euclidean_distance(landmarks[eye_points[0]], landmarks[eye_points[3]])

    # 上下眼皮距离
    ver_distance1 = euclidean_distance(landmarks[eye_points[1]], landmarks[eye_points[5]])
    ver_distance2 = euclidean_distance(landmarks[eye_points[2]], landmarks[eye_points[4]])

    ver_distance = (ver_distance1 + ver_distance2) / 2.0

    # 归一化比值 (ver / hor)，与头部姿态无关
    ratio = ver_distance / hor_distance if hor_distance != 0 else 0
    return ratio

# 摄像头流函数
def generate_frames():
    global COUNTER, TOTAL_BLINKS, STREAMING

    cap = cv2.VideoCapture(0)
    while True:
        if not STREAMING:
            break
        success, frame = cap.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 手部检测（仅识别，不绘制）
        hands.process(rgb_frame)

        # 面部网格检测
        face_mesh_results = face_mesh.process(rgb_frame)
        if face_mesh_results.multi_face_landmarks:
            for face_landmarks in face_mesh_results.multi_face_landmarks:
                mp_drawing.draw_landmarks(
                    frame,
                    face_landmarks,
                    mp_face_mesh.FACEMESH_TESSELATION,
                    mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=1, circle_radius=1),
                    mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=1, circle_radius=1)
                )
                # 获取归一化 (x, y, z) 坐标
                landmarks = []
                for lm in face_landmarks.landmark:
                    landmarks.append((lm.x, lm.y, lm.z))

                # 左右眼分别计算ratio
                left_eye_ratio = blink_ratio(landmarks, LEFT_EYE)
                right_eye_ratio = blink_ratio(landmarks, RIGHT_EYE)
                avg_ratio = (left_eye_ratio + right_eye_ratio) / 2.0

                # 眨眼检测逻辑
                print(f'Left Eye Ratio: {left_eye_ratio:.2f}, Right Eye Ratio: {right_eye_ratio:.2f}, Avg Ratio: {avg_ratio:.2f}')
                if avg_ratio < 0.30:  # 归一化后，闭眼时比值变小（可根据实际调试）
                    COUNTER += 1
                else:
                    if COUNTER > 2:  # 连续几帧闭眼算一次眨眼
                        TOTAL_BLINKS += 1
                        COUNTER = 0
                        socketio.emit("blink_event", {"total": TOTAL_BLINKS})
                # # 显示眨眼次数
                # cv2.putText(frame, f'Total Blinks: {TOTAL_BLINKS}', (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                # # 检测到眨眼时提示
                # if COUNTER > 2:
                #     print('blink')
                #     cv2.putText(frame, 'Blink!', (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)

        # 编码帧并通过流发送
        _, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

    cap.release()

# 摄像头流接口
@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/start_stream", methods=["POST"])
def start_stream():
    global STREAMING
    STREAMING = True
    return {"status": "started"}

@app.route("/stop_stream", methods=["POST"])
def stop_stream():
    global STREAMING
    STREAMING = False
    return {"status": "stopped"}

# React入口页面
@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    socketio.run(app, debug=True)
