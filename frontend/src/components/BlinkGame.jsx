import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import ClassicMode from "./ClassicMode";
import MusicMode from "./MusicMode";
import ControlMode from "./ControlMode";
import CommandMode from "./CommandMode";

const BlinkGame = () => {
    const videoRef = useRef(null);
    const [mode, setMode] = useState("classic");
    const [threshold, setThreshold] = useState(null);
    const [calibrated, setCalibrated] = useState(false);
    const socket = useRef(null);

    useEffect(() => {
        // 摄像头采集
        navigator.mediaDevices
            .getUserMedia({ video: true })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            })
            .catch((err) => {
                console.error("获取摄像头失败:", err);
            });

        // Socket 连接
        socket.current = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
        });

        socket.current.on("calibrated", (data) => {
            setThreshold(data.threshold.toFixed(3));
            setCalibrated(true);
        });

        // 开始校准
        fetch(`${import.meta.env.VITE_SOCKET_URL}/start_calibration`, {
            method: "POST",
        });

        return () => {
            socket.current.disconnect();
        };
    }, []);

    // 持续传输视频帧
    useEffect(() => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const sendFrame = () => {
            const video = videoRef.current;
            if (!video) return;

            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    if (blob && socket.current?.connected) {
                        socket.current.emit("frame", blob);
                    }
                },
                "image/jpeg",
                0.6
            );
        };

        const interval = setInterval(sendFrame, 1000 / 15); // ~15 fps

        return () => clearInterval(interval);
    }, []);

    const renderModeComponent = () => {
        switch (mode) {
            case "command":
                return <CommandMode />;
            case "music":
                return <MusicMode />;
            case "control":
                return <ControlMode />;
            case "classic":
            default:
                return <ClassicMode />;
        }
    };

    return (
        <div style={{ position: "relative", width: "640px" }}>
            <div
                style={{
                    width: "640px",
                    height: "480px",
                    position: "relative",
                }}>
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                    }}
                />
                {!calibrated && (
                    <div
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            backgroundColor: "rgba(0,0,0,0.7)",
                            padding: "20px",
                            color: "white",
                            fontSize: "22px",
                            borderRadius: "12px",
                            fontWeight: "bold",
                            zIndex: 20,
                        }}>
                        请睁眼、闭眼几次进行校准...
                    </div>
                )}
                <div
                    style={{
                        position: "absolute",
                        top: "10px",
                        left: "10px",
                        zIndex: 10,
                    }}>
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        style={{ fontSize: "16px", padding: "4px" }}>
                        <option value="classic">经典模式</option>
                        <option value="command">命令模式</option>
                        <option value="music">音乐模式</option>
                        <option value="control">控制模式</option>
                    </select>
                </div>
                {threshold && calibrated && (
                    <div
                        style={{
                            position: "absolute",
                            top: "10px",
                            right: "10px",
                            zIndex: 10,
                            color: "lightgreen",
                            fontWeight: "bold",
                        }}>
                        阈值: {threshold}
                    </div>
                )}
                {renderModeComponent()}
            </div>
        </div>
    );
};

export default BlinkGame;
