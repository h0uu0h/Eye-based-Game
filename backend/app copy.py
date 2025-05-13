from flask import Flask, Response, render_template
import cv2
import mediapipe as mp
from math import sqrt
from flask_cors import CORS

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

mp_hands = mp.solutions.hands
mp_face_mesh = mp.solutions.face_mesh

hands = mp_hands.Hands(static_image_mode=False, max_num_hands=4, min_detection_confidence=0.5, min_tracking_confidence=0.5)
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=2, min_detection_confidence=0.5, min_tracking_confidence=0.5)

# 眼部关键点索引
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

COUNTER = 0
TOTAL_BLINKS = 0

def euclidean_distance(p1, p2):
    x1, y1 = p1
    x2, y2 = p2
    return sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

def blink_ratio(landmarks, eye_points):
    # 横向距离
    hor_distance = euclidean_distance(landmarks[eye_points[0]], landmarks[eye_points[3]])
    # 纵向距离（上下眼皮）
    ver_distance1 = euclidean_distance(landmarks[eye_points[1]], landmarks[eye_points[5]])
    ver_distance2 = euclidean_distance(landmarks[eye_points[2]], landmarks[eye_points[4]])

    ver_distance = (ver_distance1 + ver_distance2) / 2.0

    ratio = hor_distance / ver_distance if ver_distance != 0 else 0
    return ratio

# 摄像头流函数
def generate_frames():
    global COUNTER, TOTAL_BLINKS

    cap = cv2.VideoCapture(0)
    while True:
        success, frame = cap.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 手部检测（仅做识别但不绘制）
        hands.process(rgb_frame)

        # 面部网格检测
        face_mesh_results = face_mesh.process(rgb_frame)
        if face_mesh_results.multi_face_landmarks:
            for face_landmarks in face_mesh_results.multi_face_landmarks:
                # 提取面部坐标
                landmarks = []
                for lm in face_landmarks.landmark:
                    x, y = int(lm.x * frame.shape[1]), int(lm.y * frame.shape[0])
                    landmarks.append((x, y))

                # 计算眨眼比率
                left_eye_ratio = blink_ratio(landmarks, LEFT_EYE)
                right_eye_ratio = blink_ratio(landmarks, RIGHT_EYE)
                avg_ratio = (left_eye_ratio + right_eye_ratio) / 2.0

                # 眨眼检测逻辑
                print(f'Left Eye Ratio: {left_eye_ratio:.2f}, Right Eye Ratio: {right_eye_ratio:.2f}, Avg Ratio: {avg_ratio:.2f}')

                if avg_ratio > 4.5:  # 根据实际情况可微调
                    COUNTER += 1
                else:
                    if COUNTER > 2:
                        TOTAL_BLINKS += 1
                        COUNTER = 0

                # 在视频上显示眨眼次数
                cv2.putText(frame, f'Total Blinks: {TOTAL_BLINKS}', (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                # 如果检测到眨眼，给出提示
                if COUNTER > 2:
                    print('blinkblinkblink')
                    cv2.putText(frame, 'Blink!', (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)

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

# React入口页面
@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)
