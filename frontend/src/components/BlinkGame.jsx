import { useState, useEffect } from "react";
import ClassicMode from "./ClassicMode";
import CommandMode from "./CommandMode";
import MusicMode from "./MusicMode";
import ControlMode from "./ControlMode";
import EarmWaveform from "./EarmWaveform";
import { io } from "socket.io-client";

const BlinkGame = () => {
    const [mode, setMode] = useState("classic");
    const [threshold, setThreshold] = useState(null);
    const [calibrated, setCalibrated] = useState(false);

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on("calibrated", (data) => {
            console.log("已校准，阈值为:", data.threshold);
            setThreshold(data.threshold.toFixed(3));
            setCalibrated(true);
        });

        fetch("http://localhost:5000/start_calibration", {
            method: "POST",
        }).then(() => console.log("启动校准请求已发送"));

        return () => socket.disconnect();
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
                    position: "relative",
                    width: "640px",
                    height: "480px",
                }}>
                <img
                    src={`http://localhost:5000/video_feed?key=${Date.now()}`}
                    alt="Video Stream"
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                    }}
                    onLoad={() => console.log("视频流加载完成")}
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
            <div style={{ marginTop: "20px" }}>
                <EarmWaveform />
            </div>
        </div>
    );
};

export default BlinkGame;
