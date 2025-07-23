/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

// 音效导入
import bgSound from "/sounds/maze/background.mp3";
import footstepSound from "/sounds/maze/footsteps.mp3";
import wallSound from "/sounds/maze/wall.mp3";
import turnSound from "/sounds/maze/turn.mp3";
import wrongSound from "/sounds/maze/wrong.mp3";
import timerSound from "/sounds/maze/timer.mp3";
import levelUpSound from "/sounds/maze/levelup.mp3";
import victorySound from "/sounds/maze/victory.mp3";
import failSound from "/sounds/maze/fail.mp3";

const MazeRescueMode = ({ onGameEnd, shouldEnd }) => {
    // ================ 可配置参数 ================
    const config = {
        closeEyeTime: { min: 3000, max: 5000 }, // 闭眼时间范围
        blinkWindow: 3000, // 眨眼时间窗口
        timeReward: 1000, // 每次奖励时间
        turnSequence: ["right", "left", "right", "left"], // 转向顺序
        voiceDelay: 1000, // 语音延迟
        totalTime: 30000, // 总游戏时间
    };

    // ================ 状态管理 ================
    const gameStatsRef = useRef({
        totalTime: 0,
        blinkCount: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongTurns: 0,
        closeEyeDuration: 0,
        timeBonus: 0,
    });

    const [gameState, setGameState] = useState("intro"); // intro, waiting, playing, direction, ended
    const [currentStep, setCurrentStep] = useState(0);
    const [blinkInWindow, setBlinkInWindow] = useState(0);
    const [remainingTime, setRemainingTime] = useState(config.totalTime / 1000);
    const [blinkCount, setBlinkCount] = useState(0);
    const [leftBlinks, setLeftBlinks] = useState(0);
    const [rightBlinks, setRightBlinks] = useState(0);
    const [wrongTurns, setWrongTurns] = useState(0);
    const [eyeState, setEyeState] = useState("open");

    // ================ Refs ================
    const socket = useRef(null);
    const countdownTimerRef = useRef(null);
    const moveTimerRef = useRef(null);
    const directionTimerRef = useRef(null);
    const blinkWindowTimerRef = useRef(null);
    const closeEyeStartRef = useRef(0);
    const lastBlinkTimeRef = useRef(0);
    const startGameDebounceRef = useRef(null);
    const gameStateRef = useRef(gameState);
    const currentStepRef = useRef(currentStep);
    const blinkInWindowRef = useRef(blinkInWindow);

    // 同步ref状态
    useEffect(() => {
        gameStateRef.current = gameState;
        currentStepRef.current = currentStep;
        blinkInWindowRef.current = blinkInWindow;
    }, [gameState, currentStep, blinkInWindow]);

    // 音效Refs
    const bgAudioRef = useRef(null);
    const footstepAudioRef = useRef(null);
    const wallAudioRef = useRef(null);
    const turnAudioRef = useRef(null);
    const wrongAudioRef = useRef(null);
    const timerAudioRef = useRef(null);
    const levelUpAudioRef = useRef(null);
    const victoryAudioRef = useRef(null);
    const failAudioRef = useRef(null);

    // ================ 核心函数 ================
    const speak = useCallback((text) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        window.speechSynthesis.speak(utterance);
    }, []);

    const stopAllSounds = useCallback(() => {
        [
            bgAudioRef,
            footstepAudioRef,
            wallAudioRef,
            turnAudioRef,
            wrongAudioRef,
            timerAudioRef,
            levelUpAudioRef,
            victoryAudioRef,
            failAudioRef,
        ].forEach((ref) => {
            if (ref.current) {
                ref.current.pause();
                ref.current.currentTime = 0;
            }
        });
    }, []);

    // ================ 游戏逻辑 ================
    const startGame = useCallback(() => {
        if (gameStateRef.current !== "intro") return;

        // 重置游戏数据
        gameStatsRef.current = {
            totalTime: 0,
            blinkCount: 0,
            leftBlinks: 0,
            rightBlinks: 0,
            wrongTurns: 0,
            closeEyeDuration: 0,
            timeBonus: 0,
        };
        setCurrentStep(0);
        setBlinkInWindow(0);
        setGameState("waiting");
        setRemainingTime(config.totalTime / 1000);
        setBlinkCount(0);
        setLeftBlinks(0);
        setRightBlinks(0);
        setWrongTurns(0);

        // 播放背景音乐
        bgAudioRef.current.loop = true;
        bgAudioRef.current.volume = 0.3;
        bgAudioRef.current.play().catch(console.warn);

        // 游戏开始语音
        speak(
            "您的好朋友正在迷宫的另一侧等待救援，根据声音提示尽快过去吧！闭双眼开始计时。"
        );

        // 开始倒计时
        countdownTimerRef.current = setInterval(() => {
            setRemainingTime((prev) => {
                const newTime = prev - 1;
                if (newTime <= 0) {
                    endGame(false);
                    return 0;
                }
                return newTime;
            });

            gameStatsRef.current.totalTime += 1000;
            if (gameStatsRef.current.totalTime >= config.totalTime) {
                endGame(false);
            }
        }, 1000);
    }, [speak]);

    const startMoving = useCallback(() => {
        if (gameStateRef.current !== "waiting") return;

        setGameState("playing");
        closeEyeStartRef.current = Date.now();
        footstepAudioRef.current.loop = true;
        footstepAudioRef.current.play();

        // 随机时间后撞墙
        const wallTime =
            config.closeEyeTime.min +
            Math.random() * (config.closeEyeTime.max - config.closeEyeTime.min);

        moveTimerRef.current = setTimeout(() => {
            wallAudioRef.current.play();
            speak("睁双眼停止移动");
        }, wallTime);
    }, [speak]);

    const stopMoving = useCallback(() => {
        if (gameStateRef.current !== "playing") return;

        clearTimeout(moveTimerRef.current);
        footstepAudioRef.current.pause();

        // 记录闭眼时长
        gameStatsRef.current.closeEyeDuration +=
            Date.now() - closeEyeStartRef.current;

        // 进入方向选择
        setGameState("direction");
        speak("眨双眼多次获得方向");

        // 1秒后开始眨眼窗口
        directionTimerRef.current = setTimeout(() => {
            if (gameStateRef.current === "direction") {
                startBlinkWindow();
            }
        }, config.voiceDelay);
    }, [speak]);

    const startBlinkWindow = useCallback(() => {
        setGameState("blinkWindow");
        setBlinkInWindow(0);
        timerAudioRef.current.play();

        blinkWindowTimerRef.current = setTimeout(() => {
            endBlinkWindow();
        }, config.blinkWindow);
    }, []);

    const endBlinkWindow = useCallback(() => {
        timerAudioRef.current.pause();
        setGameState("direction");

        // 计算时间奖励
        const bonus =
            Math.floor(blinkInWindowRef.current / 2) * config.timeReward;
        gameStatsRef.current.timeBonus += bonus;

        const direction = config.turnSequence[currentStepRef.current];
        speak(`前方${direction === "left" ? "左" : "右"}转`);
    }, [speak]);

    const handleCorrectTurn = useCallback(() => {
        const direction = config.turnSequence[currentStepRef.current];
        turnAudioRef.current.play();

        // 更新统计
        if (direction === "left") {
            setLeftBlinks((prev) => prev + 1);
            gameStatsRef.current.leftBlinks++;
        } else {
            setRightBlinks((prev) => prev + 1);
            gameStatsRef.current.rightBlinks++;
        }

        // 检查是否完成
        if (currentStepRef.current >= config.turnSequence.length - 1) {
            endGame(true);
        } else {
            setCurrentStep((prev) => prev + 1);
            setGameState("waiting");
            speak("闭双眼继续前行");
        }
    }, [speak]);

    const handleWrongTurn = useCallback(() => {
        wrongAudioRef.current.play();
        setWrongTurns((prev) => prev + 1);
        gameStatsRef.current.wrongTurns++;

        const direction = config.turnSequence[currentStepRef.current];
        speak(
            `${direction === "left" ? "左" : "右"}眨眼${
                direction === "left" ? "左" : "右"
            }转`
        );
    }, [speak]);

    const endGame = useCallback(
        (isSuccess) => {
            // 清理所有计时器
            clearInterval(countdownTimerRef.current);
            clearTimeout(moveTimerRef.current);
            clearTimeout(directionTimerRef.current);
            clearTimeout(blinkWindowTimerRef.current);
            clearTimeout(startGameDebounceRef.current);

            // 停止所有音效
            stopAllSounds();

            // 播放结束音效
            if (isSuccess) {
                victoryAudioRef.current.play();
            } else {
                failAudioRef.current.play();
            }

            // 准备结算数据
            const finalStats = {
                ...gameStatsRef.current,
                isSuccess,
                finalTime:
                    (config.totalTime - gameStatsRef.current.timeBonus) / 1000,
                mode: "maze",
                timestamp: Date.now(),
            };

            setGameState("ended");
            onGameEnd(finalStats);
        },
        [onGameEnd, stopAllSounds]
    );

    // ================ 事件处理 ================
    const handleBlinkEvent = useCallback(
        (data) => {
            setBlinkCount(data.total);
            gameStatsRef.current.blinkCount = data.total;

            // 开始游戏
            if (gameStateRef.current === "intro" && data.total >= 2) {
                clearTimeout(startGameDebounceRef.current);
                startGameDebounceRef.current = setTimeout(startGame, 300);
                return;
            }

            // 方向选择
            if (gameStateRef.current === "direction") {
                const now = Date.now();
                if (now - lastBlinkTimeRef.current < 300) return;
                lastBlinkTimeRef.current = now;

                const expectedDirection =
                    config.turnSequence[currentStepRef.current];
                if (data.type === expectedDirection) {
                    handleCorrectTurn();
                } else {
                    handleWrongTurn();
                }
            }

            // 眨眼窗口
            if (gameStateRef.current === "blinkWindow") {
                setBlinkInWindow((prev) => prev + 1);
                levelUpAudioRef.current.play();
            }
        },
        [handleCorrectTurn, handleWrongTurn, startGame]
    );

    const handleEyeState = useCallback(
        (data) => {
            setEyeState(data.status);

            if (
                gameStateRef.current === "waiting" &&
                data.status === "closed"
            ) {
                startMoving();
            } else if (
                gameStateRef.current === "playing" &&
                data.status === "open"
            ) {
                stopMoving();
            }
        },
        [startMoving, stopMoving]
    );

    // 新增：处理左右眼眨眼事件
    const handleLeftBlink = useCallback(
        (data) => {
            setBlinkCount((prev) => prev + 1);
            gameStatsRef.current.blinkCount++;

            if (
                gameStateRef.current === "intro" &&
                gameStatsRef.current.blinkCount >= 2
            ) {
                clearTimeout(startGameDebounceRef.current);
                startGameDebounceRef.current = setTimeout(startGame, 300);
                return;
            }

            // 在方向选择状态，左眼眨眼表示左转
            if (gameStateRef.current === "direction") {
                const now = Date.now();
                if (now - lastBlinkTimeRef.current < 300) return;
                lastBlinkTimeRef.current = now;

                const expectedDirection =
                    config.turnSequence[currentStepRef.current];
                if (expectedDirection === "left") {
                    handleCorrectTurn();
                } else {
                    handleWrongTurn();
                }
            }
        },
        [startGame, handleCorrectTurn, handleWrongTurn]
    );

    const handleRightBlink = useCallback(
        (data) => {
            setBlinkCount((prev) => prev + 1);
            gameStatsRef.current.blinkCount++;

            if (
                gameStateRef.current === "intro" &&
                gameStatsRef.current.blinkCount >= 2
            ) {
                clearTimeout(startGameDebounceRef.current);
                startGameDebounceRef.current = setTimeout(startGame, 300);
                return;
            }

            // 在方向选择状态，右眼眨眼表示右转
            if (gameStateRef.current === "direction") {
                const now = Date.now();
                if (now - lastBlinkTimeRef.current < 300) return;
                lastBlinkTimeRef.current = now;

                const expectedDirection =
                    config.turnSequence[currentStepRef.current];
                if (expectedDirection === "right") {
                    handleCorrectTurn();
                } else {
                    handleWrongTurn();
                }
            }
        },
        [startGame, handleCorrectTurn, handleWrongTurn]
    );

    // ================ 生命周期 ================
    useEffect(() => {
        socket.current = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
        });

        socket.current.on("blink_event", handleBlinkEvent);
        socket.current.on("eye_state", handleEyeState);
        socket.current.on("left_blink_event", handleLeftBlink);
        socket.current.on("right_blink_event", handleRightBlink);

        // 初始语音提示
        speak("欢迎来到迷宫救援游戏，请眨双眼两次开始游戏");

        return () => {
            socket.current.disconnect();
            stopAllSounds();
            window.speechSynthesis.cancel();
        };
    }, [
        handleBlinkEvent,
        handleEyeState,
        handleLeftBlink,
        handleRightBlink,
        speak,
        stopAllSounds,
    ]);

    useEffect(() => {
        if (shouldEnd && gameStateRef.current !== "ended") {
            endGame(false);
        }
    }, [shouldEnd, endGame]);

    // 渲染游戏状态文本
    const renderGameState = () => {
        switch (gameState) {
            case "intro":
                return "请眨双眼两次开始游戏";
            case "waiting":
                return eyeState === "closed"
                    ? "移动中...闭双眼继续前行"
                    : "请闭双眼开始移动";
            case "playing":
                return "移动中...睁双眼停止";
            case "direction":
                return "请选择方向：左眨眼左转，右眨眼右转";
            case "blinkWindow":
                return `快速眨眼增加时间奖励！(${blinkInWindow}次)`;
            case "ended":
                return "游戏结束";
            default:
                return "";
        }
    };

    // ================ 渲染 ================
    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                color: "white",
                zIndex: 100,
                padding: "20px",
                textAlign: "center",
            }}>
            {/* 游戏标题 */}
            <h1 style={{ fontSize: "2.5rem", marginBottom: "20px" }}>
                迷宫救援
            </h1>

            {/* 游戏状态显示 */}
            <div style={{ fontSize: "1.5rem", marginBottom: "20px" }}>
                {renderGameState()}
            </div>

            {/* 倒计时和统计信息 */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    marginBottom: "30px",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    padding: "15px",
                    borderRadius: "10px",
                    width: "80%",
                    maxWidth: "500px",
                }}>
                <div style={{ fontSize: "1.8rem", fontWeight: "bold" }}>
                    剩余时间: {remainingTime}秒
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-around",
                        width: "100%",
                        marginTop: "10px",
                    }}>
                    <div>
                        <div>当前步骤</div>
                        <div style={{ fontSize: "1.5rem" }}>
                            {currentStep + 1}/{config.turnSequence.length}
                        </div>
                    </div>

                    <div>
                        <div>左眼眨眼</div>
                        <div style={{ fontSize: "1.5rem" }}>{leftBlinks}</div>
                    </div>

                    <div>
                        <div>右眼眨眼</div>
                        <div style={{ fontSize: "1.5rem" }}>{rightBlinks}</div>
                    </div>

                    <div>
                        <div>错误转向</div>
                        <div style={{ fontSize: "1.5rem" }}>{wrongTurns}</div>
                    </div>
                </div>
            </div>

            {/* 操作说明 */}
            <div
                style={{
                    marginTop: "20px",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    padding: "15px",
                    borderRadius: "8px",
                    maxWidth: "600px",
                }}>
                <h3>操作说明</h3>
                <ul style={{ textAlign: "left", marginTop: "10px" }}>
                    <li>闭双眼：向前移动</li>
                    <li>睁双眼：停止移动</li>
                    <li>左眨眼：左转</li>
                    <li>右眨眼：右转</li>
                    <li>快速眨眼：获得时间奖励</li>
                </ul>
            </div>

            {/* 隐藏的音效元素 */}
            <div style={{ display: "none" }}>
                <audio ref={bgAudioRef} src={bgSound} preload="auto" />
                <audio
                    ref={footstepAudioRef}
                    src={footstepSound}
                    preload="auto"
                />
                <audio ref={wallAudioRef} src={wallSound} preload="auto" />
                <audio ref={turnAudioRef} src={turnSound} preload="auto" />
                <audio ref={wrongAudioRef} src={wrongSound} preload="auto" />
                <audio ref={timerAudioRef} src={timerSound} preload="auto" />
                <audio
                    ref={levelUpAudioRef}
                    src={levelUpSound}
                    preload="auto"
                />
                <audio
                    ref={victoryAudioRef}
                    src={victorySound}
                    preload="auto"
                />
                <audio ref={failAudioRef} src={failSound} preload="auto" />
            </div>
        </div>
    );
};

export default MazeRescueMode;
