from flask import Flask, Response, render_template
import cv2
import mediapipe as mp
from math import sqrt
from flask_cors import CORS
from flask_socketio import SocketIO
from threading import Thread, Event, Lock
import time
import eventlet

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# MediaPipe初始化
mp_drawing = mp.solutions.drawing_utils
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=2, min_detection_confidence=0.5)

# 眼部关键点索引
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

class VideoStreamer:
    def __init__(self):
        self.frame = None
        self.stop_event = Event()
        self.lock = Lock()
        self.blink_counter = 0
        self.total_blinks = 0
        self.cap = None
        self.stream_thread = None

    def start_stream(self):
        if self.stream_thread and self.stream_thread.is_alive():
            return

        self.stop_event.clear()
        self.stream_thread = Thread(target=self._capture_frames)
        self.stream_thread.start()

    def stop_stream(self):
        self.stop_event.set()
        if self.stream_thread:
            self.stream_thread.join(timeout=1)
        if self.cap and self.cap.isOpened():
            self.cap.release()
        self.frame = None

    def _capture_frames(self):
        self.cap = cv2.VideoCapture(0)
        while not self.stop_event.is_set():
            success, frame = self.cap.read()
            if not success:
                break

            # 图像处理和面部识别
            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # 面部检测
            results = face_mesh.process(rgb_frame)
            if results.multi_face_landmarks:
                for face_landmarks in results.multi_face_landmarks:
                    # 绘制面部网格
                    mp_drawing.draw_landmarks(
                        image=frame,
                        landmark_list=face_landmarks,
                        connections=mp_face_mesh.FACEMESH_TESSELATION,
                        landmark_drawing_spec=mp_drawing.DrawingSpec(color=(0,255,0), thickness=1, circle_radius=1),
                        connection_drawing_spec=mp_drawing.DrawingSpec(color=(0,0,255), thickness=1)
                    )

                    # 眨眼检测逻辑
                    landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
                    left_ratio = self._blink_ratio(landmarks, LEFT_EYE)
                    right_ratio = self._blink_ratio(landmarks, RIGHT_EYE)
                    avg_ratio = (left_ratio + right_ratio) / 2

                    if avg_ratio < 0.3:
                        self.blink_counter += 1
                        print(f'Left Eye Ratio: {left_ratio:.2f}, Right Eye Ratio: {right_ratio:.2f}, Avg Ratio: {avg_ratio:.2f}, Blink Counter: {self.blink_counter:.2f}')
                    else:
                        if self.blink_counter > 2:
                            self.total_blinks += 1
                            self.blink_counter = 0
                            print("blink")
                            socketio.emit("blink_event", {"total": self.total_blinks}, namespace='/')

            # 更新帧数据
            with self.lock:
                _, buffer = cv2.imencode('.jpg', frame)
                self.frame = buffer.tobytes()
        eventlet.sleep(0.033)

    def _blink_ratio(self, landmarks, eye_points):
        def euclidean_distance(p1, p2):
            x1, y1, z1 = p1
            x2, y2, z2 = p2
            return sqrt((x2 - x1)**2 + (y2 - y1)**2 + (z2 - z1)**2)

        hor_distance = euclidean_distance(landmarks[eye_points[0]], landmarks[eye_points[3]])
        ver_distance1 = euclidean_distance(landmarks[eye_points[1]], landmarks[eye_points[5]])
        ver_distance2 = euclidean_distance(landmarks[eye_points[2]], landmarks[eye_points[4]])
        ver_distance = (ver_distance1 + ver_distance2) / 2.0
        return ver_distance / hor_distance if hor_distance != 0 else 0

    def generate(self):
        while not self.stop_event.is_set():
            with self.lock:
                if self.frame is None:
                    time.sleep(0.1)
                    continue
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + self.frame + b'\r\n')
            eventlet.sleep(0.033)  # 约30fps

video_streamer = VideoStreamer()

@app.route('/video_feed')
def video_feed():
    return Response(video_streamer.generate(),
                   mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/start_stream", methods=["POST"])
def start_stream():
    video_streamer.start_stream()
    return {"status": "started"}

@app.route("/stop_stream", methods=["POST"])
def stop_stream():
    video_streamer.stop_stream()
    return {"status": "stopped"}

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)