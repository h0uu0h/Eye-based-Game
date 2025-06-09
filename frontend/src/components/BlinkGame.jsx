/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import ClassicMode from "./ClassicMode";
import MusicMode from "./MusicMode";
import styles from "./BlinkGame.module.css";
import ControlMode from "./ControlMode";
import GameSummary from "./GameSummary";
import CommandMode from "./CommandMode";
import outputIcon from "/icon/output.svg";

const BlinkGame = () => {
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null); // ✅ 用 ref 保证引用
    const capRef = useRef(0);
    const sendFrameIntervalRef = useRef(null);
    const [mode, setMode] = useState("classic");
    const [threshold, setThreshold] = useState(null);
    const [calibrated, setCalibrated] = useState(false);
    const socket = useRef(null);

    /***************************** */
    const [summary, setSummary] = useState(null);
    const [gameStarted, setGameStarted] = useState(false);

    const handleToggleGame = () => {
        setGameStarted((prev) => !prev);
    };

    const handleGameEnd = (result) => {
        if (!result) return;
        setSummary(result); // 弹出结算框
    };
    /***************************** */

    // 游戏开始的逻辑
    useEffect(() => {
        if (!gameStarted) return;

        // 摄像头 + socket 初始化
        const setupCameraAndSocket = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                });
                const videoTrack = stream.getVideoTracks()[0];
                const capabilities = videoTrack.getCapabilities().frameRate.max;
                console.log(
                    "video capabilities:",
                    videoTrack.getCapabilities()
                );
                console.log("video settings:", videoTrack.getSettings());
                console.log("video constraints:", videoTrack.getConstraints());
                capRef.current = capabilities;
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("获取摄像头失败:", err);
            }

            socket.current = io(import.meta.env.VITE_SOCKET_URL, {
                transports: ["websocket"],
            });

            socket.current.on("calibrated", (data) => {
                setThreshold(data.threshold.toFixed(3));
                setCalibrated(true);
            });

            // 启动校准
            fetch(`${import.meta.env.VITE_SOCKET_URL}/start_calibration`, {
                method: "POST",
            });

            // 发送帧
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            sendFrameIntervalRef.current = setInterval(() => {
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
            }, 1000 / capRef.current);

            // 画眼睛点
            socket.current.on("eye_landmarks", drawEyePoints);
        };

        const drawEyePoints = ({
            left_eye,
            right_eye,
            mouth_outer,
            mouth_inner,
        }) => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);

            const draw = (points, color) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                points.forEach(([x, y], idx) => {
                    const px = x * canvas.width;
                    const py = y * canvas.height;
                    if (idx === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                });
                ctx.closePath();
                ctx.stroke();

                ctx.fillStyle = color;
                points.forEach(([x, y]) => {
                    const px = x * canvas.width;
                    const py = y * canvas.height;
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                });
            };

            draw(left_eye, "cyan");
            draw(right_eye, "lime");
            if (mouth_outer?.length) draw(mouth_outer, "cyan"); // 外部轮廓
            if (mouth_inner?.length) draw(mouth_inner, "lime"); // 内部轮廓

            ctx.restore();
        };

        setupCameraAndSocket();

        return () => {
            // 释放资源
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            if (sendFrameIntervalRef.current) {
                clearInterval(sendFrameIntervalRef.current);
            }
            if (socket.current) {
                socket.current.off("eye_landmarks");
                socket.current.disconnect();
            }

            setCalibrated(false);
            setThreshold(null);
        };
    }, [gameStarted]);

    // mode change
    const renderModeComponent = () => {
        switch (mode) {
            case "command":
                return <CommandMode onGameEnd={handleGameEnd} />;
            case "music":
                return <MusicMode onGameEnd={handleGameEnd} />;
            case "control":
                return <ControlMode onGameEnd={handleGameEnd} />;
            case "classic":
                return <ClassicMode onGameEnd={handleGameEnd} />;
            default:
                return <ClassicMode onGameEnd={handleGameEnd} />;
        }
    };

    return (
        <div
            className={styles.blinkContainer}
            style={{
                backgroundColor: gameStarted ? "rgb(0,0,0)" : "rgba(0,0,0,0.5)",
            }}>
            {!gameStarted && (
                <div>
                    <h1>&nbsp;&nbsp;休息休息眼睛吧！</h1>
                    <button
                        onClick={() => {
                            const history =
                                localStorage.getItem("blinkGameHistory");
                            if (!history) {
                                alert("没有历史记录可导出！");
                                return;
                            }
                            const blob = new Blob([history], {
                                type: "application/json",
                            });
                            const url = URL.createObjectURL(blob);

                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `blink_game_history_${Date.now()}.json`;
                            a.click();

                            URL.revokeObjectURL(url); // 释放资源
                        }}
                        className={styles.outputBtn}>
                        <img src={outputIcon} style={{ width: "30px" }} />
                    </button>
                    <div>
                        <select
                            value={mode}
                            className={styles.selectBox}
                            onChange={(e) => setMode(e.target.value)}>
                            <option value="classic">经典模式</option>
                            <option value="command">命令模式</option>
                            <option value="music">音乐模式</option>
                            <option value="control">控制模式</option>
                        </select>
                    </div>
                </div>
            )}
            <button
                onClick={handleToggleGame}
                className={styles.startBtn}
                style={{
                    position: gameStarted ? "absolute" : "static",
                    top: gameStarted ? "60px" : "",
                    left: gameStarted ? "60px" : "",
                }}>
                {gameStarted ? "End Game" : "START"}
            </button>
            {gameStarted && (
                <div
                    style={{
                        height: "80%",
                        width: "90%",
                        position: "absolute",
                        zIndex: "-1",
                        // backgroundColor:"pink",
                    }}>
                    <canvas
                        ref={canvasRef}
                        width={640}
                        height={480}
                        style={{
                            position: "absolute",
                            left: "0",
                            pointerEvents: "none",
                        }}
                    />
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{
                            position: "absolute",
                            left: "0",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            transform: "scaleX(-1)",
                            visibility: "hidden",
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
                    {threshold && calibrated && (
                        <div
                            style={{
                                position: "absolute",
                                top: "10px",
                                right: "100px",
                                zIndex: 10,
                                color: "lightgreen",
                                fontWeight: "bold",
                            }}>
                            阈值: {threshold}
                        </div>
                    )}
                    {renderModeComponent()}
                </div>
            )}
            {summary && (
                <GameSummary data={summary} onClose={() => setSummary(null)} />
            )}
        </div>
    );
};

export default BlinkGame;
