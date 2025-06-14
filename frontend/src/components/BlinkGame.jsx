/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import ClassicMode from "./ClassicMode";
import MusicMode from "./MusicMode";
import styles from "./BlinkGame.module.css";
import ControlMode from "./ControlMode";
import GameSummary from "./GameSummary";
import CommandMode from "./CommandMode";
import DataPanel from "./DataPanel";
import PlayMode from "./PlayMode";
import outputIcon from "/icon/output.svg";
import deleteIcon from "/icon/delete.svg";

const BlinkGame = () => {
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const capRef = useRef(0);
    const sendFrameIntervalRef = useRef(null);
    const [mode, setMode] = useState("classic");
    // const [threshold, setThreshold] = useState(null);
    const [calibrated, setCalibrated] = useState(false);
    const socket = useRef(null);

    /**************结算************* */
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

    /*************实验数据************ */
    const [showDataPanel, setShowDataPanel] = useState(false);
    const [experimentData, setExperimentData] = useState({
        gameId: Date.now().toString(36) + Math.random().toString(36).substr(2),
        startTime: Date.now(),
        endTime: null,
        mode: null,
        frames: [],
        events: [],
        calibration: [],
    });

    // 添加键盘事件监听
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "h" || e.key === "H") {
                setShowDataPanel((prev) => !prev);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    // 初始化实验数据
    useEffect(() => {
        if (gameStarted) {
            setExperimentData({
                gameId:
                    Date.now().toString(36) +
                    Math.random().toString(36).substr(2),
                startTime: Date.now(),
                endTime: null,
                mode,
                frames: [],
                events: [],
                calibration: [],
            });
        }
    }, [gameStarted, mode]);

    // 游戏结束时保存实验数据
    useEffect(() => {
        if (!gameStarted && experimentData.startTime) {
            const completedData = {
                ...experimentData,
                endTime: Date.now(),
            };

            // 保存到本地存储
            const experiments = JSON.parse(
                localStorage.getItem("experimentData") || "[]"
            );
            experiments.push(completedData);
            localStorage.setItem("experimentData", JSON.stringify(experiments));

            setExperimentData(completedData);
        }
    }, [gameStarted]);
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

            // 已校准 => 读取本地存储的阈值，否则触发校准
            const localThreshold = localStorage.getItem("threshold");
            if (localThreshold) {
                setCalibrated(true);
                // setThreshold(parseFloat(localThreshold));
                console.log("已加载本地阈值:", localThreshold);
            } else {
                // ⬅️ 第一次使用，发起校准
                fetch(`${import.meta.env.VITE_SOCKET_URL}/start_calibration`, {
                    method: "POST",
                });
            }

            // 监听校准完成
            socket.current.on("calibrated", (data) => {
                const threshold = data.threshold.toFixed(3);
                // setThreshold(threshold);
                setCalibrated(true);
                localStorage.setItem("threshold", threshold);
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

            // 确保画布尺寸正确
            if (!canvas.width || !canvas.height) {
                canvas.width = 640;
                canvas.height = 480;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);

            const draw = (points, color) => {
                // 处理二维和三维坐标
                const normalizedPoints = points.map((point) => {
                    // 如果是二维坐标 [x, y]
                    if (point.length === 2) return point;
                    // 如果是三维坐标 [x, y, z]
                    if (point.length === 3) return [point[0], point[1]];
                    return [0, 0]; // 默认值
                });

                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();

                normalizedPoints.forEach(([x, y], idx) => {
                    const px = x * canvas.width;
                    const py = y * canvas.height;
                    if (idx === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                });

                ctx.closePath();
                ctx.stroke();

                ctx.fillStyle = color;
                normalizedPoints.forEach(([x, y]) => {
                    const px = x * canvas.width;
                    const py = y * canvas.height;
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                });
            };

            if (left_eye?.length) draw(left_eye, "cyan");
            if (right_eye?.length) draw(right_eye, "lime");
            if (mouth_outer?.length) draw(mouth_outer, "cyan");
            if (mouth_inner?.length) draw(mouth_inner, "lime");

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
            case "play":
                return <PlayMode onGameEnd={handleGameEnd} />;
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
            {!gameStarted && <h1>&nbsp;&nbsp;休息休息眼睛吧！</h1>}
            <button
                disabled={gameStarted}
                onClick={() => {
                    const history = localStorage.getItem("blinkGameHistory");
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
                <img
                    src={outputIcon}
                    style={{
                        width: "30px",
                        fill: gameStarted ? "#b3b3b3" : "white",
                    }}
                />
            </button>
            <div>
                <select
                    disabled={gameStarted}
                    value={mode}
                    className={styles.selectBox}
                    onChange={(e) => setMode(e.target.value)}>
                    <option value="classic">校准模式</option>
                    <option value="command">命令模式</option>
                    <option value="play">演奏模式</option>
                    <option value="music">音乐模式</option>
                    <option value="control">控制模式</option>
                </select>
            </div>
            <button
                disabled={gameStarted}
                style={{ backgroundColor: gameStarted ? "#b3b3b3" : "white" }}
                className={styles.calibrateBtn}
                onClick={() => {
                    localStorage.removeItem("threshold");
                    setCalibrated(false);
                    alert("已清除校准数据，下次进入将重新校准");
                }}>
                {localStorage.getItem("threshold") || "uncalibrated"}
            </button>
            <button
                disabled={gameStarted}
                onClick={() => {
                    if (confirm("确定要清除所有历史记录吗？此操作不可撤销。")) {
                        localStorage.removeItem("blinkGameHistory");
                        alert("历史记录已清除！");
                    }
                }}
                className={styles.deleteBtn}>
                <img
                    src={deleteIcon} // 你可以换成删除图标
                    style={{
                        width: "24px",
                        filter: gameStarted ? "grayscale(100%)" : "none",
                    }}
                    alt="清除历史"
                />
            </button>
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
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            pointerEvents: "none",
                            border: "15px dashed rgba(255,255,255,0.5)",
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
                    {renderModeComponent()}
                </div>
            )}
            {summary && (
                <GameSummary data={summary} onClose={() => setSummary(null)} />
            )}
            {showDataPanel && (
                <DataPanel
                    onClose={() => setShowDataPanel(false)}
                    experimentData={experimentData}
                    setExperimentData={setExperimentData}
                />
            )}
        </div>
    );
};

export default BlinkGame;
