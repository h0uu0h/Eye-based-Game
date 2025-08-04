/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import styles from "./BlinkGame.module.css";
// import ClassicMode from "./ClassicMode";
import MazeRescueMode from "./MazeRescueMode";
// import JumpMode from "./JumpMode";
import GameSummary from "./GameSummary";
import outputIcon from "/icon/output.svg";
import deleteIcon from "/icon/delete.svg";
import DiceSpaceMode from "./DiceSpaceMode";
import BaselineMode from "./BaselineMode";

const BlinkGame = ({
    mode: externalMode = "baseline",
    config,
    onComplete,
    gameId,
    experimentId,
}) => {
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const capRef = useRef(0);
    const sendFrameIntervalRef = useRef(null);
    const [mode, setMode] = useState(externalMode);
    const [calibrated, setCalibrated] = useState(false);
    const [currentGameMode, setCurrentGameMode] = useState(mode);
    const socket = useRef(null);

    // 传入游戏ID
    const gameIdRef = useRef(gameId);

    /**************结算************* */
    const resultRef = useRef(null);
    const [summary, setSummary] = useState(null);
    const [gameStarted, setGameStarted] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);

    const maze60Config = {
        closeEyeTime: [4, 5, 6], // 随机闭眼时间 (秒)
        blinkWindowDuration: 3000, // 眨眼奖励窗口时间 (毫秒)
        timeReward: 500, // 每次奖励时间 (毫秒)
        turnSequence: ["right", "left"], // 转向顺序
        voiceDelay: 1000, // 语音提示延迟 (毫秒)
        promptTimeout: 1000, // 操作提示超时 (毫秒)
        totalTime: 60000, // 总游戏时间 (毫秒)
    };
    const dice60Config = {
        closeEyeTime: [4, 5, 6], // 随机闭眼时间 (秒)
        bonusWindowDuration: 3000, // 奖励窗口时间 (毫秒)
        bonusPerBlink: 0.5, // 每次眨眼增加的点数
        switchSequence: ["right", "left"], // 切换骰子顺序
        voiceDelay: 1000, // 语音提示延迟 (毫秒)
        promptTimeout: 1000, // 操作提示超时 (毫秒)
        totalTime: 60000, // 总游戏时间 (毫秒)
        minPoints: 14, // 成功所需的最小点数
    };
    const handleToggleGame = () => {
        if (!gameStarted) {
            // 开始游戏
            setCurrentGameMode(mode); // 保存当前游戏模式
            setGameStarted(true);
            setGameEnded(false); // 重置结束状态
        } else {
            // 结束游戏 - 先标记游戏结束，等待游戏模式组件处理
            setGameEnded(true);
        }
    };

    // 当游戏结束标记被设置时，处理游戏结束
    useEffect(() => {
        if (gameEnded && gameStarted) {
            console.log("游戏结束请求已发出，等待游戏模式组件处理...");
            // 这里不需要做任何事，等待游戏模式组件调用 handleGameEnd
        }
    }, [gameEnded, gameStarted]);

    // 当游戏模式组件返回结果时处理
    const handleGameEnd = (result) => {
        resultRef.current = result;

        // 确保 socket 可用
        if (!socket.current) {
            console.error("Socket 不可用");
            return;
        }

        // 发送结束游戏请求到后端
        socket.current.emit("end_game", (response) => {
            if (response?.status === "game_ended") {
                console.log("resultRef.current", resultRef.current);

                setSummary(resultRef.current);
                console.log("收到后端游戏数据:", response.game_data);
                const {
                    blinkCount,
                    leftBlinks,
                    rightBlinks,
                    timestamp,
                    mode,
                    totalBlinks,
                    ...filteredFrontendResult
                } = resultRef.current;
                // 合并前后端数据
                const fullRecord = {
                    ...filteredFrontendResult,
                    ...response.game_data,
                };

                console.log("完整游戏记录:", fullRecord);

                // 保存到本地历史
                const history = JSON.parse(
                    localStorage.getItem("blinkGameHistory") || "[]"
                );
                history.push(fullRecord);
                localStorage.setItem(
                    "blinkGameHistory",
                    JSON.stringify(history)
                );

                // 如果有关联的实验ID，也保存到实验特定的存储中
                if (experimentId) {
                    const experimentBlinkHistory = JSON.parse(
                        localStorage.getItem(`blinkHistory_${experimentId}`) ||
                            "[]"
                    );
                    experimentBlinkHistory.push({
                        ...fullRecord,
                        gameId: gameIdRef.current,
                        experimentId: experimentId,
                    });
                    localStorage.setItem(
                        `blinkHistory_${experimentId}`,
                        JSON.stringify(experimentBlinkHistory)
                    );
                }
                // 更新摘要显示完整数据
                // setSummary(resultRef.current);
            }

            // 关闭游戏
            setGameStarted(false);
            setGameEnded(false);
        });
    };
    /***************************** */

    // 实验模式下自动开始游戏
    useEffect(() => {
        if (onComplete && !gameStarted) {
            setGameStarted(true);
            setGameEnded(false);
        }
    }, [onComplete]);

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
            socket.current.emit(
                "start_game",
                { game_type: currentGameMode, game_id: gameIdRef.current },
                (response) => {
                    if (response.status === "game_started") {
                        console.log(
                            `游戏已开始: ${response.game_id}, 模式: ${response.game_type}`
                        );
                    }
                }
            );
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
    const handleExportHistory = () => {
        const history = JSON.parse(
            localStorage.getItem("blinkGameHistory") || "[]"
        );
        if (history.length === 0) {
            alert("没有历史记录可导出！");
            return;
        }

        // 创建更详细的历史数据
        const exportData = {
            meta: {
                export_date: new Date().toISOString(),
                total_games: history.length,
            },
            games: history,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `blink_game_history_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    // mode change
    const renderModeComponent = () => {
        switch (mode) {
            case "maze60":
                return (
                    <MazeRescueMode
                        onGameEnd={handleGameEnd}
                        shouldEnd={gameEnded}
                        config={maze60Config}
                    />
                );
            case "dice_60":
                return (
                    <DiceSpaceMode
                        onGameEnd={handleGameEnd}
                        shouldEnd={gameEnded}
                        config={dice60Config}
                    />
                );
            case "maze":
                return (
                    <MazeRescueMode
                        onGameEnd={handleGameEnd}
                        shouldEnd={gameEnded}
                        config={config}
                    />
                );
            case "dice":
                return (
                    <DiceSpaceMode
                        onGameEnd={handleGameEnd}
                        shouldEnd={gameEnded}
                        config={config}
                    />
                );
            case "baseline":
                return (
                    <BaselineMode
                        onGameEnd={handleGameEnd}
                        shouldEnd={gameEnded}
                        config={config}
                    />
                );
            default:
                return (
                    <BaselineMode
                        onGameEnd={handleGameEnd}
                        shouldEnd={gameEnded}
                        config={config}
                    />
                );
        }
    };

    // 检查是否在实验模式下
    const isExperimentMode = onComplete !== undefined;

    return (
        <div
            className={styles.blinkContainer}
            style={{
                backgroundColor: gameStarted ? "rgb(0,0,0)" : "rgba(0,0,0,0.5)",
            }}>
            {!gameStarted && !isExperimentMode && (
                <h1>&nbsp;&nbsp;休息休息眼睛吧！</h1>
            )}
            {!isExperimentMode && (
                <>
                    <button
                        disabled={gameStarted}
                        onClick={handleExportHistory}
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
                            // disabled={gameStarted}
                            value={mode}
                            className={styles.selectBox}
                            onChange={(e) => setMode(e.target.value)}>
                            <option value="baseline">基线模式</option>
                            <option value="maze">迷宫20</option>
                            <option value="dice">骰子20</option>
                            <option value="maze60">迷宫60</option>
                            <option value="dice60">骰子60</option>
                        </select>
                    </div>
                    <button
                        disabled={gameStarted}
                        style={{
                            backgroundColor: gameStarted ? "#b3b3b3" : "white",
                        }}
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
                            if (
                                confirm(
                                    "确定要清除所有历史记录吗？此操作不可撤销。"
                                )
                            ) {
                                localStorage.removeItem("blinkGameHistory");
                                alert("历史记录已清除！");
                            }
                        }}
                        className={styles.deleteBtn}>
                        <img
                            src={deleteIcon}
                            style={{
                                width: "24px",
                                filter: gameStarted
                                    ? "grayscale(100%)"
                                    : "none",
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
                </>
            )}
            {gameStarted && (
                <div
                    style={{
                        // height: "80%",
                        // width: "90%",
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        zIndex: "-1",
                        margin: 0,
                        padding: 0,
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
                            zIndex: "-1",
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
                <GameSummary
                    data={summary}
                    onClose={() => {
                        setSummary(null);
                        // 如果是实验模式，关闭结算框后调用完成回调
                        if (onComplete) {
                            // 传递眨眼数据给父组件
                            onComplete(gameIdRef.current, resultRef.current);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default BlinkGame;
