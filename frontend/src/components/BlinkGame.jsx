import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io("https://eyeye.onrender.com");

export default function BlinkGame() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [blinkCount, setBlinkCount] = useState(0);
  const [eyeState, setEyeState] = useState("open");
  const [calibrated, setCalibrated] = useState(false);

  // 连接事件
  useEffect(() => {
    socket.on("blink_event", (data) => {
      setBlinkCount(data.total);
    });

    socket.on("eye_state", (data) => {
      setEyeState(data.status);
    });

    socket.on("calibrated", () => {
      setCalibrated(true);
    });

    return () => {
      socket.off("blink_event");
      socket.off("eye_state");
      socket.off("calibrated");
    };
  }, []);

  // 摄像头采集并传图像帧
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        const sendFrame = () => {
          if (
            videoRef.current &&
            canvasRef.current &&
            calibrated // 只在校准后发送
          ) {
            const ctx = canvasRef.current.getContext("2d");
            ctx.drawImage(videoRef.current, 0, 0, 320, 240);
            canvasRef.current.toBlob((blob) => {
              if (blob) {
                socket.emit("frame", blob);
              }
            }, "image/jpeg", 0.6);
          }
        };

        const intervalId = setInterval(sendFrame, 100); // 每秒10帧

        return () => clearInterval(intervalId);
      } catch (err) {
        console.error("无法访问摄像头:", err);
      }
    };

    initCamera();
  }, [calibrated]);

  // 手动触发校准
  const startCalibration = async () => {
    try {
      const res = await fetch("https://eyeye.onrender.com/start_calibration", {
        method: "POST",
      });
      const result = await res.json();
      if (result.status === "calibrating") {
        setCalibrated(false);
      }
    } catch (err) {
      console.error("启动校准失败:", err);
    }
  };

  return (
    <div>
      <h2>眨眼检测游戏</h2>
      <p>状态：{eyeState}</p>
      <p>总眨眼次数：{blinkCount}</p>
      <button onClick={startCalibration}>开始校准</button>

      <video
        ref={videoRef}
        width="320"
        height="240"
        style={{ display: "none" }}
      />
      <canvas
        ref={canvasRef}
        width="320"
        height="240"
        style={{ display: "none" }}
      />
    </div>
  );
}
