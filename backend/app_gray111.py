from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image
from math import sqrt
import eventlet
import eventlet.green.threading as threading
import time  # Import time module for duration calculation

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
    refine_landmarks=True,  # Use more refined face mesh
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
mp_drawing = mp.solutions.drawing_utils

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
        self.blink_counter = 0  # Used to count frames eyes are closed
        self.total_blinks = 0  # Total blinks for game logic
        self.current_eye_state = "open"  # Overall eye state (open/closed)
        self.calibrating = True
        self.ratios = []  # For calibration
        self.min_ratio = float("inf")  # Min EAR during calibration (fully closed)
        self.max_ratio = float("-inf")  # Max EAR during calibration (fully open)
        self.threshold = 0.3  # Blink threshold (calculated during calibration)

        # New variables for detailed blink tracking
        self.closed_start_time = None  # Timestamp when eyes start closing
        self.current_blink_min_ear_during_closure = float(
            "inf"
        )  # Lowest EAR observed during current closure
        # Factor to determine partial blink: if min_ear during blink is > min_ratio + (threshold - min_ratio) * this_factor, it's partial.
        # This means if the eye doesn't close sufficiently towards min_ratio.
        self.partial_blink_ear_threshold_factor = 0.5  # Tunable: 0.5 means if min_ear is in upper half of closed range, it's partial.

        # Add CLAHE for image contrast enhancement
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def _blink_ratio(self, landmarks, eye_points):
        """Calculates the Eye Aspect Ratio (EAR) for a given eye."""

        def euclidean(p1, p2):
            x1, y1, z1 = p1
            x2, y2, z2 = p2
            return sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)

        # Calculate vertical distances
        ver1 = euclidean(landmarks[eye_points[1]], landmarks[eye_points[5]])
        ver2 = euclidean(landmarks[eye_points[2]], landmarks[eye_points[4]])
        ver = (ver1 + ver2) / 2.0

        # Calculate horizontal distance
        hor = euclidean(landmarks[eye_points[0]], landmarks[eye_points[3]])

        return ver / hor if hor != 0 else 0

    def process_frame(self, frame):
        """Processes a single video frame to detect blinks and eye states."""
        # Convert to grayscale and apply CLAHE for contrast enhancement
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = self.clahe.apply(gray)

        # Convert enhanced grayscale to 3-channel image for MediaPipe
        gray_3ch = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        rgb = cv2.cvtColor(gray_3ch, cv2.COLOR_BGR2RGB)

        results = face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            # If no face detected, reset states to avoid false positives
            self.current_eye_state = "open"
            self.closed_start_time = None
            self.current_blink_min_ear_during_closure = float("inf")
            self.blink_counter = 0
            return

        for face_landmarks in results.multi_face_landmarks:
            landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
            left_ratio = self._blink_ratio(landmarks, LEFT_EYE)
            right_ratio = self._blink_ratio(landmarks, RIGHT_EYE)
            avg_ratio = (left_ratio + right_ratio) / 2

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

            # Calibration logic
            if self.calibrating:
                self.min_ratio = min(self.min_ratio, avg_ratio)
                self.max_ratio = max(self.max_ratio, avg_ratio)
                self.ratios.append(avg_ratio)
                if len(self.ratios) >= 100:  # Calibrate after 100 frames
                    # Calculate threshold: 40% between min (closed) and max (open)
                    self.threshold = (
                        self.min_ratio + (self.max_ratio - self.min_ratio) * 0.4
                    )
                    self.calibrating = False
                    socketio.start_background_task(
                        lambda: socketio.emit(
                            "calibrated", {"threshold": self.threshold}
                        )
                    )
                return  # Exit early during calibration

            # Main blink detection and detailed data collection
            if avg_ratio < self.threshold:  # Eyes are considered closed
                if self.current_eye_state != "closed":
                    self.current_eye_state = "closed"
                    self.closed_start_time = time.time()  # Record start of closure
                    self.current_blink_min_ear_during_closure = (
                        avg_ratio  # Reset min EAR for this closure
                    )
                    socketio.start_background_task(
                        lambda: socketio.emit("eye_state", {"status": "closed"})
                    )
                else:  # Still closed, update min EAR
                    self.current_blink_min_ear_during_closure = min(
                        self.current_blink_min_ear_during_closure, avg_ratio
                    )
                self.blink_counter += 1  # Increment counter while eyes are closed

            else:  # Eyes are considered open
                if (
                    self.current_eye_state == "closed"
                ):  # Just opened from a closed state (blink completed)
                    self.current_eye_state = "open"
                    socketio.start_background_task(
                        lambda: socketio.emit("eye_state", {"status": "open"})
                    )

                    # Only process if it was a valid blink (closed for a minimum duration)
                    if (
                        self.blink_counter > 2
                    ):  # Minimum frames closed to be considered a valid blink
                        closed_duration = (
                            (time.time() - self.closed_start_time)
                            if self.closed_start_time
                            else 0
                        )
                        blink_min_ear = self.current_blink_min_ear_during_closure

                        # Classify blink type:
                        # If the min_ear during the blink is significantly higher than the fully closed min_ratio, it's partial.
                        blink_type = "full"
                        if (
                            blink_min_ear
                            > self.min_ratio
                            + (self.threshold - self.min_ratio)
                            * self.partial_blink_ear_threshold_factor
                        ):
                            blink_type = "partial"

                        self.total_blinks += 1  # Increment total blinks for game logic

                        # Emit general blink event (for ClassicMode and general blink count)
                        socketio.start_background_task(
                            lambda: socketio.emit(
                                "blink_event", {"total": self.total_blinks}
                            )
                        )

                        # Emit detailed blink event (for experimental data)
                        socketio.start_background_task(
                            lambda: socketio.emit(
                                "detailed_blink_event",
                                {
                                    "type": blink_type,
                                    "duration": closed_duration,  # in seconds
                                    "min_ear": blink_min_ear,
                                },
                            )
                        )
                    self.blink_counter = (
                        0  # Reset blink counter after a blink is processed
                    )
                else:  # Eyes are still open, ensure state is open and reset blink counter
                    if self.current_eye_state != "open":
                        self.current_eye_state = "open"
                        socketio.start_background_task(
                            lambda: socketio.emit("eye_state", {"status": "open"})
                        )
                    self.blink_counter = 0  # Reset counter if eyes are open

            # Emit EAR value for general tracking/visualization
            socketio.start_background_task(
                lambda: socketio.emit("ear_value", {"value": avg_ratio})
            )


detector = BlinkDetector()


@socketio.on("frame")
def handle_frame(data):
    try:
        if hasattr(data, "read"):
            image_data = data.read()
        else:
            image_data = data
        img = Image.open(BytesIO(image_data))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        detector.process_frame(frame)
    except Exception as e:
        print("[ERROR] Frame decode failed:", e)


@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    detector.calibrating = True
    detector.ratios.clear()
    detector.min_ratio = float("inf")
    detector.max_ratio = float("-inf")
    return {"status": "calibrating"}


@app.route("/")
def index():
    return {"status": "backend is live"}


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)
