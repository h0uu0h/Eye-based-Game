/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import { useEffect, useRef } from "react";
import io from "socket.io-client";

const BlinkDetector = ({ onBlink, onData, shouldEnd }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const socketRef = useRef(null);
    const sendFrameIntervalRef = useRef(null);
    const capRef = useRef(0);
    // 眨眼统计
    const blinkStatsRef = useRef({
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        blinkDetails: [],
        startTime: Date.now(),
    });

    useEffect(() => {
        const setupCameraAndSocket = async () => {
            try {
                // 获取摄像头访问权限
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                const videoTrack = stream.getVideoTracks()[0];
                const capabilities = videoTrack.getCapabilities().frameRate.max;
                capRef.current = capabilities;
                // 连接到后端
                socketRef.current = io(import.meta.env.VITE_SOCKET_URL, {
                    transports: ["websocket"],
                });

                // 开始纯眨眼检测
                socketRef.current.emit("start_detection", (response) => {
                    if (response?.status === "detection_started") {
                        console.log("纯眨眼检测已启动");
                    }
                });

                // 设置发送帧的定时器
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                let lastSent = Date.now();

                sendFrameIntervalRef.current = setInterval(() => {
                    const video = videoRef.current;
                    if (!video || video.readyState !== 4) return;

                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob && socketRef.current?.connected) {
                                socketRef.current.emit("frame", blob);
                            }
                        },
                        "image/jpeg",
                        0.6
                    );
                }, 1000 / capRef.current); // ~30fps
            } catch (err) {
                console.error("摄像头初始化失败:", err);
                // 可选：通知父组件错误
            }
        };

        setupCameraAndSocket();

        return () => {
            // 清理资源
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
            if (sendFrameIntervalRef.current) {
                clearInterval(sendFrameIntervalRef.current);
            }
            if (socketRef.current) {
                socketRef.current.off("detection_update");
                socketRef.current.disconnect();
            }
        };
    }, []);

    // 处理结束检测
    useEffect(() => {
        if (shouldEnd && socketRef.current) {
            // 请求结束检测
            socketRef.current.emit("end_detection", (response) => {
                if (response?.status === "detection_ended") {
                    const data = response.data;

                    // 组装最终数据
                    const finalData = {
                        totalBlinks: data.total_blinks,
                        leftBlinks: data.left_blinks,
                        rightBlinks: data.right_blinks,
                        blinkDetails: data.blink_details,
                        duration: data.duration,
                        timestamp: data.timestamp,
                    };
                    console.log("finalData", finalData);
                    // 发送数据
                    if (onData) onData(finalData);

                    // 重置本地状态
                    blinkStatsRef.current = {
                        totalBlinks: 0,
                        leftBlinks: 0,
                        rightBlinks: 0,
                        blinkDetails: [],
                        startTime: Date.now(),
                    };
                }
            });
        }
    }, [shouldEnd, onData]);

    return (
        <div>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ transform: "scaleX(-1)", visibility: "hidden",position:"absolute",zIndex:"-1000", }}
            />
        </div>
    );
};

export default BlinkDetector;
