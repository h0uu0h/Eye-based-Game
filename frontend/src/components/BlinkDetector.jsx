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
        startTime: Date.now(),
    });

    useEffect(() => {
        const setupCameraAndSocket = async () => {
            try {
                // 获取摄像头访问权限
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                });
                const videoTrack = stream.getVideoTracks()[0];
                const capabilities = videoTrack.getCapabilities().frameRate.max;
                capRef.current = capabilities;
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                // 连接到后端
                socketRef.current = io(import.meta.env.VITE_SOCKET_URL, {
                    transports: ["websocket"],
                });

                // 开始检测
                socketRef.current.emit("start_detection");

                // 设置发送帧的定时器
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
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
                }, 1000 / capRef.current); // 10fps

                // 监听眨眼事件
                socketRef.current.on("blink_event", (data) => {
                    blinkStatsRef.current.totalBlinks = data.total;
                    if (onBlink) onBlink(data);
                });

                socketRef.current.on("left_blink_event", () => {
                    blinkStatsRef.current.leftBlinks += 1;
                    blinkStatsRef.current.totalBlinks += 1;
                });

                socketRef.current.on("right_blink_event", () => {
                    blinkStatsRef.current.rightBlinks += 1;
                    blinkStatsRef.current.totalBlinks += 1;
                });
            } catch (err) {
                console.error("摄像头初始化失败:", err);
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
                socketRef.current.disconnect();
            }
        };
    }, []);

    // 处理结束检测
    useEffect(() => {
        if (shouldEnd && socketRef.current) {
            // 计算持续时间
            const duration =
                (Date.now() - blinkStatsRef.current.startTime) / 1000;

            // 组装最终数据
            const finalData = {
                ...blinkStatsRef.current,
                duration,
                timestamp: new Date().toISOString(),
            };

            // 发送数据
            if (onData) onData(finalData);

            // 通知后端结束检测
            socketRef.current.emit("end_detection");
        }
    }, [shouldEnd, onData]);

    return (
        <div style={{ display: "none" }}>
            <video ref={videoRef} autoPlay muted playsInline />
        </div>
    );
};

export default BlinkDetector;
