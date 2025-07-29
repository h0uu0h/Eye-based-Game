/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

// 音效导入
import bgSound from "/sounds/dice/background.mp3";
import rollSound from "/sounds/dice/roll.mp3";
import readySound from "/sounds/dice/ready.mp3";
import switchSound from "/sounds/dice/switch.mp3";
import wrongSound from "/sounds/dice/wrong.mp3";
import timerSound from "/sounds/dice/timer.mp3";
import levelUpSound from "/sounds/dice/levelup.mp3";
import victorySound from "/sounds/dice/victory.mp3";
import failSound from "/sounds/dice/fail.mp3";

const DiceSpaceMode = ({ onGameEnd, shouldEnd }) => {
    // ================ 可配置参数 ================
    const config = {
        diceCount: 4,
        minPoints: 14,
        closeEyeTime: [2, 3, 4, 5], // 闭眼时间范围 (秒)
        blinkWindow: 3000, // 眨眼时间窗口 (毫秒)
        pointPerBlink: 1, // 每眨眼两次增加1点
        switchSequence: ["right", "left", "right", "left"], // 切换顺序
        voiceDelay: 1000, // 语音延迟 (毫秒)
        totalTime: 30000, // 总游戏时间 (毫秒)
    };

    // ================ 游戏状态 ================
    const [gamePhase, setGamePhase] = useState("intro"); // intro, ready, rolling, throwPrompt, bonusWindow, switching, success, fail
    const [currentDice, setCurrentDice] = useState(0); // 当前骰子索引
    const [dicePoints, setDicePoints] = useState(
        Array(config.diceCount).fill(0)
    ); // 每个骰子的点数
    const [totalPoints, setTotalPoints] = useState(0); // 总点数
    const [remainingTime, setRemainingTime] = useState(config.totalTime / 1000); // 剩余时间
    const [blinkCount, setBlinkCount] = useState(0); // 眨眼次数
    const [bonusBlinks, setBonusBlinks] = useState(0); // 奖励窗口内的眨眼次数

    // 游戏统计
    const [stats, setStats] = useState({
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongBlinks: 0,
        closeEyeDuration: 0,
        bonusPoints: 0,
    });

    // ================ Refs ================
    const socket = useRef(null);
    const statsRef = useRef({
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongBlinks: 0,
        closeEyeDuration: 0,
        bonusPoints: 0,
    });

    const gameTimers = useRef({
        countdown: null,
        roll: null,
        throwPrompt: null,
        bonusWindow: null,
        switchPrompt: null,
    });

    const gameState = useRef({
        phase: "intro",
        eyeState: "open",
        closeEyeStart: 0,
        basePoint: 0, // 骰子基础点数
        bonusPoint: 0, // 奖励点数
        lastBlinkTime: 0,
        isSpeaking: false,
        isRollingPlaying: false,
    });

    // 同步ref状态
    useEffect(() => {
        gameState.current.phase = gamePhase;
    }, [gamePhase]);

    // 音效Refs
    const audioRefs = useRef({
        bg: null,
        roll: null,
        ready: null,
        switch: null,
        wrong: null,
        timer: null,
        levelUp: null,
        victory: null,
        fail: null,
    });

    // ================ 核心函数 ================
    const speak = useCallback((text) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        window.speechSynthesis.speak(utterance);
    }, []);

    const speakAndWait = useCallback(async (text) => {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) return resolve();

            gameState.current.isSpeaking = true;
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "zh-CN";
            utterance.onend = () => {
                setTimeout(() => {
                    gameState.current.isSpeaking = false;
                    resolve();
                }, 200);
            };
            window.speechSynthesis.speak(utterance);
        });
    }, []);

    const playSound = useCallback((soundName, options = {}) => {
        const audio = audioRefs.current[soundName];
        if (!audio) return;

        if (options.loop) audio.loop = true;
        if (options.volume) audio.volume = options.volume;

        audio.currentTime = 0;
        audio.play().catch(console.warn);
    }, []);

    const stopSound = useCallback((soundName) => {
        const audio = audioRefs.current[soundName];
        if (!audio) return;

        audio.pause();
        audio.currentTime = 0;
    }, []);

    const stopAllSounds = useCallback(() => {
        Object.values(audioRefs.current).forEach((audio) => {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        });
    }, []);

    // ================ 游戏逻辑 ================
    const startGame = useCallback(async () => {
        if (gameState.current.phase !== "intro") return;

        // 清除所有计时器
        Object.values(gameTimers.current).forEach((timer) => {
            if (timer) clearTimeout(timer);
        });

        // 重置游戏状态
        setGamePhase("ready");
        setCurrentDice(0);
        setDicePoints(Array(config.diceCount).fill(0));
        setTotalPoints(0);
        setBlinkCount(0);
        setBonusBlinks(0);

        statsRef.current = {
            totalBlinks: 0,
            leftBlinks: 0,
            rightBlinks: 0,
            wrongBlinks: 0,
            closeEyeDuration: 0,
            bonusPoints: 0,
        };
        setStats(statsRef.current);

        gameState.current = {
            ...gameState.current,
            phase: "ready",
            eyeState: "open",
            closeEyeStart: 0,
            basePoint: 0,
            bonusPoint: 0,
            lastBlinkTime: 0,
            isSpeaking: false,
            isRollingPlaying: false,
        };

        // 播放背景音乐
        playSound("bg", { loop: true, volume: 0.3 });

        // 游戏开始语音
        await speakAndWait(
            "掷出4个骰子并使点数之和大于14即可离开骰子空间，闭双眼开始摇第一个骰子，并在听到提示后掷出。"
        );

        // 开始倒计时
        gameTimers.current.countdown = setInterval(() => {
            setRemainingTime((prev) => {
                const newTime = prev - 1;
                if (newTime <= 0) {
                    endGame(false);
                    return 0;
                }
                return newTime;
            });
        }, 1000);
    }, [speakAndWait, playSound]);

    const startRolling = useCallback(() => {
        if (gameState.current.phase !== "ready") return;

        // 记录闭眼开始时间
        gameState.current.closeEyeStart = Date.now();
        gameState.current.eyeState = "closed";
        setGamePhase("rolling");

        // 播放摇骰子音效
        if (!gameState.current.isRollingPlaying) {
            playSound("roll", { loop: true });
            gameState.current.isRollingPlaying = true;
        }

        // 随机摇骰子时间
        const minTime = config.closeEyeTime[0] * 1000;
        const maxTime =
            config.closeEyeTime[config.closeEyeTime.length - 1] * 1000;
        const rollTime = Math.floor(
            Math.random() * (maxTime - minTime) + minTime
        );

        // 设置摇骰子定时器
        gameTimers.current.roll = setTimeout(() => {
            stopRolling();
        }, rollTime);
    }, [playSound]);

    const stopRolling = useCallback(() => {
        if (gameState.current.phase !== "rolling") return;

        // 停止摇骰子音效
        stopSound("roll");
        gameState.current.isRollingPlaying = false;

        // 清除摇骰子定时器
        clearTimeout(gameTimers.current.roll);
        gameTimers.current.roll = null;

        // 累加闭眼时间
        const closeDuration = Date.now() - gameState.current.closeEyeStart;
        statsRef.current.closeEyeDuration += closeDuration;
        setStats((prev) => ({
            ...prev,
            closeEyeDuration: statsRef.current.closeEyeDuration,
        }));

        gameState.current.eyeState = "open";

        // 生成基础点数 (1-6)
        gameState.current.basePoint = Math.floor(Math.random() * 6) + 1;
        gameState.current.bonusPoint = 0;

        // 播放准备音效
        playSound("ready");
        setGamePhase("throwPrompt");
        speak("眨双眼两次掷出骰子");

        // 设置提示超时
        gameTimers.current.throwPrompt = setTimeout(() => {
            if (gameState.current.phase === "throwPrompt") {
                speak("眨双眼多次获得点数和奖励");
                startBonusWindow();
            }
        }, config.voiceDelay);
    }, [speak, playSound, stopSound]);

    const startBonusWindow = useCallback(() => {
        setGamePhase("bonusWindow");
        setBonusBlinks(0);
        playSound("timer");

        // 3秒后结束奖励窗口
        gameTimers.current.bonusWindow = setTimeout(() => {
            endBonusWindow();
        }, config.blinkWindow);
    }, [playSound]);

    const endBonusWindow = useCallback(() => {
        stopSound("timer");

        // 计算奖励点数
        const bonusPoints = Math.floor(bonusBlinks / 2) * config.pointPerBlink;
        gameState.current.bonusPoint = bonusPoints;
        statsRef.current.bonusPoints += bonusPoints;
        setStats((prev) => ({
            ...prev,
            bonusPoints: statsRef.current.bonusPoints,
        }));

        // 更新当前骰子点数
        const finalPoint = gameState.current.basePoint + bonusPoints;
        const newDicePoints = [...dicePoints];
        newDicePoints[currentDice] = finalPoint;
        setDicePoints(newDicePoints);

        // 更新总点数
        const newTotal = newDicePoints.reduce((sum, point) => sum + point, 0);
        setTotalPoints(newTotal);

        // 播报最终点数
        speak(`${finalPoint}点`);

        // 检查是否是最后一个骰子
        if (currentDice >= config.diceCount - 1) {
            // 最后一个骰子，进入结算
            setTimeout(() => {
                endGame(newTotal > config.minPoints);
            }, 2000);
        } else {
            // 提示切换方向
            const direction = config.switchSequence[currentDice];
            speak(`${direction === "left" ? "左" : "右"}眨眼切换下一个骰子`);
            setGamePhase("switching");

            // 设置切换提示超时
            gameTimers.current.switchPrompt = setTimeout(() => {
                if (gameState.current.phase === "switching") {
                    const direction = config.switchSequence[currentDice];
                    speak(`${direction === "left" ? "左" : "右"}眨眼切换`);
                }
            }, config.voiceDelay);
        }
    }, [speak, stopSound, currentDice, dicePoints, bonusBlinks]);

    const handleCorrectSwitch = useCallback(() => {
        playSound("switch");

        // 更新统计
        const direction = config.switchSequence[currentDice];
        statsRef.current.totalBlinks += 1;
        if (direction === "left") {
            statsRef.current.leftBlinks += 1;
        } else {
            statsRef.current.rightBlinks += 1;
        }
        setStats({ ...statsRef.current });

        // 切换到下一个骰子
        setCurrentDice((prev) => prev + 1);
        setBlinkCount(0);
        setGamePhase("ready");
        speak(`闭双眼开始摇第${currentDice + 2}个骰子`);
    }, [speak, playSound]);

    const handleWrongSwitch = useCallback(() => {
        playSound("wrong");
        statsRef.current.totalBlinks += 1;
        statsRef.current.wrongBlinks += 1;
        setStats({ ...statsRef.current });

        const direction = config.switchSequence[currentDice];
        speak(`${direction === "left" ? "左" : "右"}眨眼切换`);
    }, [speak, playSound]);

    const endGame = useCallback(
        (isSuccess) => {
            // 清理所有计时器
            Object.values(gameTimers.current).forEach((timer) => {
                if (timer) clearTimeout(timer);
            });

            // 停止所有音效
            stopAllSounds();

            // 播放结束音效
            playSound(isSuccess ? "victory" : "fail");

            // 准备结算数据
            const finalStats = {
                ...statsRef.current,
                isSuccess,
                dicePoints: [...dicePoints],
                totalPoints,
                mode: "diceSpace",
                timestamp: Date.now(),
            };

            setGamePhase(isSuccess ? "success" : "fail");
            onGameEnd(finalStats);
        },
        [onGameEnd, stopAllSounds, playSound, dicePoints, totalPoints]
    );

    // ================ 事件处理 ================
    const handleBlinkEvent = useCallback(
        (data) => {
            const newTotalBlinks = data.total;
            setBlinkCount(newTotalBlinks);
            statsRef.current.totalBlinks = newTotalBlinks;
            setStats((prev) => ({ ...prev, totalBlinks: newTotalBlinks }));

            // 在 intro 阶段处理开始游戏
            if (gameState.current.phase === "intro" && newTotalBlinks >= 2) {
                startGame();
                return;
            }

            // 在 throwPrompt 阶段检测是否眨眼两次
            if (
                gameState.current.phase === "throwPrompt" &&
                newTotalBlinks >= 2
            ) {
                clearTimeout(gameTimers.current.throwPrompt);
                startBonusWindow();
                return;
            }
        },
        [startGame, startBonusWindow]
    );

    const handleLeftBlink = useCallback(
        (data) => {
            // 只在特定阶段处理眨眼
            if (
                !["bonusWindow", "switching"].includes(gameState.current.phase)
            ) {
                return;
            }

            statsRef.current.totalBlinks += 1;
            setStats((prev) => ({
                ...prev,
                totalBlinks: statsRef.current.totalBlinks,
            }));

            if (gameState.current.phase === "bonusWindow") {
                // 奖励窗口中的眨眼
                setBonusBlinks((prev) => prev + 1);
                playSound("levelUp");
            } else if (gameState.current.phase === "switching") {
                // 切换骰子
                const now = Date.now();
                if (now - gameState.current.lastBlinkTime < 300) return;
                gameState.current.lastBlinkTime = now;

                const expectedDirection = config.switchSequence[currentDice];
                if (expectedDirection === "left") {
                    handleCorrectSwitch();
                } else {
                    handleWrongSwitch();
                }
            }
        },
        [handleCorrectSwitch, handleWrongSwitch, playSound]
    );

    const handleRightBlink = useCallback(
        (data) => {
            // 只在特定阶段处理眨眼
            if (
                !["bonusWindow", "switching"].includes(gameState.current.phase)
            ) {
                return;
            }

            statsRef.current.totalBlinks += 1;
            setStats((prev) => ({
                ...prev,
                totalBlinks: statsRef.current.totalBlinks,
            }));

            if (gameState.current.phase === "bonusWindow") {
                // 奖励窗口中的眨眼
                setBonusBlinks((prev) => prev + 1);
                playSound("levelUp");
            } else if (gameState.current.phase === "switching") {
                // 切换骰子
                const now = Date.now();
                if (now - gameState.current.lastBlinkTime < 300) return;
                gameState.current.lastBlinkTime = now;

                const expectedDirection = config.switchSequence[currentDice];
                if (expectedDirection === "right") {
                    handleCorrectSwitch();
                } else {
                    handleWrongSwitch();
                }
            }
        },
        [handleCorrectSwitch, handleWrongSwitch, playSound]
    );

    const handleEyeState = useCallback(
        (data) => {
            if (gameState.current.isSpeaking) return;

            gameState.current.eyeState = data.status;

            if (gameState.current.phase === "ready") {
                if (data.status === "closed") {
                    startRolling();
                }
            } else if (gameState.current.phase === "rolling") {
                if (data.status === "open") {
                    stopRolling();
                }
            }
        },
        [startRolling, stopRolling]
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
        speak("欢迎来到骰子空间游戏，请眨双眼两次开始游戏");

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
        if (
            shouldEnd &&
            gameState.current.phase !== "success" &&
            gameState.current.phase !== "fail"
        ) {
            endGame(false);
        }
    }, [shouldEnd, endGame]);

    // ================ 渲染辅助函数 ================
    const renderGameStateText = () => {
        switch (gamePhase) {
            case "intro":
                return "请眨双眼两次开始游戏";
            case "ready":
                return gameState.current.eyeState === "closed"
                    ? "摇骰子中...睁双眼停止"
                    : `请闭双眼开始摇第${currentDice + 1}个骰子`;
            case "rolling":
                return "摇骰子中...睁双眼停止";
            case "throwPrompt":
                return "请眨双眼两次掷出骰子";
            case "bonusWindow":
                return `快速眨眼增加点数！(${bonusBlinks}次眨眼)`;
            case "switching":
                return `请${
                    config.switchSequence[currentDice] === "left" ? "左" : "右"
                }眨眼切换到下一个骰子`;
            case "success":
                return "恭喜成功离开骰子空间！";
            case "fail":
                return "很遗憾，未能离开骰子空间";
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
                color: "white",
                textAlign: "center",
                background:
                    "linear-gradient(135deg, #1a2a6c, #b21f1f, #1a2a6c)",
                fontFamily:
                    '"Arial Rounded MT Bold", "Helvetica Rounded", Arial, sans-serif',
            }}>
            {/* 游戏标题 */}
            <h1 style={{ marginBottom: "-0.5rem" }}>骰子空间</h1>
            <p style={{ color: "rgb(255,255,255,0.8)" }}>
                通过闭眼摇骰和眨眼控制逃离空间
            </p>

            {/* 骰子点数显示 */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    margin: "10px 0",
                }}>
                {dicePoints.map((point, index) => (
                    <div
                        key={index}
                        style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "8px",
                            backgroundColor:
                                index === currentDice ? "#ff6b6b" : "#4ecdc4",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 5px",
                            fontWeight: "bold",
                            fontSize: "1.2rem",
                            color: "white",
                            opacity: index <= currentDice ? 1 : 0.5,
                        }}>
                        {point > 0 ? point : "?"}
                    </div>
                ))}
            </div>

            {/* 总点数显示 */}
            {gamePhase !== "intro" &&
                gamePhase !== "success" &&
                gamePhase !== "fail" && (
                    <div
                        style={{
                            margin: "10px 0",
                            fontSize: "1.2rem",
                            fontWeight: "bold",
                        }}>
                        总点数: {totalPoints} / {config.minPoints}
                    </div>
                )}

            {/* 剩余时间 */}
            {gamePhase !== "intro" &&
                gamePhase !== "success" &&
                gamePhase !== "fail" && (
                    <div style={{ margin: "10px 0", fontSize: "1.2rem" }}>
                        剩余时间: {remainingTime}秒
                    </div>
                )}

            {/* 等待开始界面（眨双眼两次） */}
            {gamePhase === "intro" && (
                <div>
                    <p>
                        闭双眼：摇骰子
                        <br />
                        睁双眼：停止摇骰
                        <br />
                        左眨眼：左转
                        <br />
                        右眨眼：右转
                    </p>
                    <p
                        style={{
                            marginTop: "2rem",
                            fontSize: "1rem",
                            color: "#ffd166",
                        }}>
                        开始游戏（眨双眼两次）
                        <span style={{ marginLeft: "10px" }}>
                            {blinkCount}/2
                        </span>
                    </p>
                </div>
            )}

            {gamePhase !== "intro" &&
                gamePhase !== "success" &&
                gamePhase !== "fail" && (
                    <>
                        <p
                            style={{
                                marginTop: "1rem",
                                fontSize: "1.2rem",
                                color: "#ffd166",
                                backgroundColor: "rgba(0,0,0,0.3)",
                                padding: "10px 20px",
                                borderRadius: "10px",
                                maxWidth: "90%",
                                minHeight: "60px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}>
                            {renderGameStateText()}
                        </p>
                    </>
                )}

            {(gamePhase === "success" || gamePhase === "fail") && (
                <div>
                    <h2 style={{ fontSize: "2rem", marginBottom: "10px" }}>
                        {gamePhase === "success"
                            ? "🎉 逃离成功! 🎉"
                            : "😢 逃离失败"}
                    </h2>
                    <p style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                        总点数: {totalPoints} / {config.minPoints}
                    </p>
                    <p>正在生成结算信息...</p>
                </div>
            )}

            {/* 隐藏的音效元素 */}
            <div style={{ display: "none" }}>
                <audio
                    ref={(el) => (audioRefs.current.bg = el)}
                    src={bgSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.roll = el)}
                    src={rollSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.ready = el)}
                    src={readySound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.switch = el)}
                    src={switchSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.wrong = el)}
                    src={wrongSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.timer = el)}
                    src={timerSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.levelUp = el)}
                    src={levelUpSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.victory = el)}
                    src={victorySound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.fail = el)}
                    src={failSound}
                    preload="auto"
                />
            </div>
        </div>
    );
};

export default DiceSpaceMode;
