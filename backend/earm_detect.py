from flask import Flask, Response, render_template
import cv2
import mediapipe as mp
from math import sqrt
from flask_cors import CORS
from flask_socketio import SocketIO
import eventlet
import eventlet.green.threading as threading
import time

eventlet.monkey_patch()

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

mp_drawing = mp.solutions.drawing_utils
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

class VideoStreamer:
    def __init__(self):
        self.frame = None
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.blink_counter = 0
        self.total_blinks = 0
        self.cap = None
        self.stream_greenlet = None
        self.current_eye_state = "open"
        self.ear_history = []
        self.ear_window_size = 11
        self.calibrating = True
        self.earm_samples = []
        self.earm_threshold = -0.06
        self.blink_cooldown = 0.5
        self.last_blink_time = 0

    def _calc_earm(self, index):
        X = self.ear_window_size
        t = index
        offset = (X + 1) // 2
        if t - offset < 0 or t + offset >= len(self.ear_history):
            return 0
        return (
            self.ear_history[t - offset] +
            self.ear_history[t - (offset - 1)] +
            self.ear_history[t + (offset - 1)] +
            self.ear_history[t + offset] -
            4 * self.ear_history[t]
        )

    def start_stream(self):
        if self.stream_greenlet and not self.stream_greenlet.dead:
            return
        self.stop_event.clear()
        self.stream_greenlet = eventlet.spawn(self._capture_frames)

    def stop_stream(self):
        self.stop_event.set()
        if self.stream_greenlet:
            self.stream_greenlet.wait(timeout=2)
        if self.cap and self.cap.isOpened():
            self.cap.release()
        self.frame = None

    def _capture_frames(self):
        self.cap = cv2.VideoCapture(0)
        while not self.stop_event.is_set():
            success, frame = self.cap.read()
            if not success:
                break

            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb_frame)

            if results.multi_face_landmarks:
                for face_landmarks in results.multi_face_landmarks:
                    mp_drawing.draw_landmarks(
                        image=frame,
                        landmark_list=face_landmarks,
                        connections=mp_face_mesh.FACEMESH_TESSELATION,
                        landmark_drawing_spec=mp_drawing.DrawingSpec(color=(0,255,0), thickness=1),
                        connection_drawing_spec=mp_drawing.DrawingSpec(color=(0,0,255), thickness=1)
                    )

                    landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
                    left_ratio = self._blink_ratio(landmarks, LEFT_EYE)
                    right_ratio = self._blink_ratio(landmarks, RIGHT_EYE)
                    avg_ratio = (left_ratio + right_ratio) / 2

                    self.ear_history.append(avg_ratio)
                    if len(self.ear_history) > 100:
                        self.ear_history.pop(0)

                    if len(self.ear_history) >= self.ear_window_size:
                        center_index = len(self.ear_history) // 2
                        earm_val = self._calc_earm(center_index)

                        socketio.start_background_task(
                            lambda: socketio.emit("earm_value", {"value": earm_val})
                        )
                        socketio.start_background_task(
                            lambda: socketio.emit("ear_value", {"value": avg_ratio})
                        )

                        if self.calibrating:
                            self.earm_samples.append(earm_val)
                            if len(self.earm_samples) >= 30:
                                self.earm_threshold = max(self.earm_samples) * 0.9
                                self.calibrating = False
                                socketio.start_background_task(
                                    lambda: socketio.emit("calibrated", {"threshold": self.earm_threshold})
                                )
                        else:
                            if earm_val < self.earm_threshold and self.current_eye_state != "closed":
                                self.current_eye_state = "closed"
                                socketio.start_background_task(
                                    lambda: socketio.emit("eye_state", {"status": "closed"})
                                )
                            elif earm_val >= self.earm_threshold and self.current_eye_state == "closed":
                                self.total_blinks += 1
                                self.current_eye_state = "open"
                                socketio.start_background_task(
                                    lambda: socketio.emit("eye_state", {"status": "open"})
                                )
                                socketio.start_background_task(
                                    lambda: socketio.emit("blink_event", {"total": self.total_blinks})
                                )

            with self.lock:
                _, buffer = cv2.imencode('.jpg', frame)
                self.frame = buffer.tobytes()

            eventlet.sleep(0.02)

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
                    eventlet.sleep(0.1)
                    continue
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + self.frame + b'\r\n')
            eventlet.sleep(0.025)

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

@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    video_streamer.calibrating = True
    video_streamer.earm_samples.clear()
    return {"status": "calibrating"}

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    socketio.run(app,
                host="0.0.0.0",
                port=5000,
                debug=True,
                use_reloader=False)
