import cv2
import dlib

# 加载人脸检测器和面部关键点预测器
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

# 打开默认摄像头
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ 无法打开摄像头")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ 无法读取帧")
        break

    # 转换为灰度图
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # 检测人脸
    faces = detector(gray)

    for face in faces:
        # 获取面部关键点
        shape = predictor(gray, face)

        # 绘制68个点
        for i in range(68):
            x = shape.part(i).x
            y = shape.part(i).y
            cv2.circle(frame, (x, y), 2, (0, 255, 0), -1)

        # 可选：画出人脸框
        cv2.rectangle(frame, (face.left(), face.top()), (face.right(), face.bottom()), (255, 0, 0), 2)

    cv2.imshow("Face Landmarks", frame)

    if cv2.waitKey(1) == 27:  # 按下 ESC 键退出
        break

cap.release()
cv2.destroyAllWindows()
