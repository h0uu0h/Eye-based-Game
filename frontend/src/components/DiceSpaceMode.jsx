/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

// 骰子游戏音效导入
import bgSound from "/sounds/dice/background.mp3";
import rollSound from "/sounds/dice/roll.mp3";
import readySound from "/sounds/dice/ready.mp3";
import switchSound from "/sounds/dice/switch.mp3";
import wrongSound from "/sounds/dice/wrong.mp3";
import timerSound from "/sounds/dice/timer.mp3";
import levelUpSound from "/sounds/dice/levelup.mp3";
import victorySound from "/sounds/dice/victory.mp3";
import failSound from "/sounds/dice/fail.mp3";

const DiceSpaceMode = ({
    onGameEnd,
    shouldEnd,
    config: incomingConfig = {},
}) => {
    // ================ 游戏配置 ================
    const defaultConfig = {
        closeEyeTime: [1, 2, 3], // 随机闭眼时间 (秒)
        bonusWindowDuration: 2000, // 奖励窗口时间 (毫秒)
        bonusPerBlink: 0.5, // 每次眨眼增加的点数
        switchSequence: ["right", "left"], // 切换骰子顺序
        voiceDelay: 1000, // 语音提示延迟 (毫秒)
        promptTimeout: 1000, // 操作提示超时 (毫秒)
        totalTime: 20000, // 总游戏时间 (毫秒)
        minPoints: 14, // 成功所需的最小点数
    };
    const config = { ...defaultConfig, ...incomingConfig };
    // ================ 游戏状态 ================
    const [gamePhase, setGamePhase] = useState("intro"); // intro, rolling, readyRoll, throwPrompt, bonusWindow, switching, success, fail
    const [remainingTime, setRemainingTime] = useState(config.totalTime / 1000);
    const [blinkCount, setBlinkCount] = useState(0);
    const [bonusBlinks, setBonusBlinks] = useState(0); // 用于UI渲染的奖励眨眼次数
    const [dicePoints, setDicePoints] = useState([]); // 用于UI渲染的骰子点数
    const [totalPoints, setTotalPoints] = useState(0); // 用于UI渲染的总点数

    const [stats, setStats] = useState({
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongSwitches: 0,
        closeEyeDuration: 0,
        bonusPoints: 0,
    });

    // ================ Refs ================
    const socket = useRef(null);
    const bonusBlinksRef = useRef(0);
    const dicePointsRef = useRef([]);
    const totalPointsRef = useRef(0);
    const currentDice = useRef(0);
    const statsRef = useRef({
        minPoints: 14,
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongSwitches: 0,
        closeEyeDuration: 0,
        bonusPoints: 0,
    });
    const gameTimers = useRef({
        countdown: null,
        roll: null,
        prompt: null,
        bonusWindow: null,
        rollCheck: null,
    });
    const gameState = useRef({
        phase: "intro",
        eyeState: "open",
        closeEyeStart: 0,
        accumulatedCloseTime: 0,
        targetCloseTime: 0,
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

        // 只有当音频未播放时才设置 currentTime 和播放
        if (audio.paused) {
            audio.currentTime = 0;
            audio.play().catch(console.warn);
        }
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

    // 生成骰子点数 (1-6)
    const generateDicePoint = useCallback(() => {
        return Math.floor(Math.random() * 6) + 1;
    }, []);

    // ================ 游戏逻辑 ================
    const startGame = useCallback(async () => {
        if (gameState.current.phase !== "intro") return;

        // 清除所有计时器
        Object.values(gameTimers.current).forEach((timer) => {
            if (timer) clearTimeout(timer);
        });

        // 重置游戏状态
        setGamePhase("rolling");
        setRemainingTime(config.totalTime / 1000);
        setBlinkCount(0);
        bonusBlinksRef.current = 0;
        setBonusBlinks(0);
        currentDice.current = 0;
        dicePointsRef.current = Array(config.switchSequence.length + 1).fill(0);
        setDicePoints([...dicePointsRef.current]);
        totalPointsRef.current = 0;
        setDicePoints([]);
        setTotalPoints(0);

        statsRef.current = {
            minPoints: 14,
            totalBlinks: 0,
            leftBlinks: 0,
            rightBlinks: 0,
            wrongSwitches: 0,
            closeEyeDuration: 0,
            bonusPoints: 0,
        };
        setStats(statsRef.current); // 刷新界面

        gameState.current = {
            ...gameState.current,
            phase: "rolling",
            eyeState: "open",
            closeEyeStart: 0,
            accumulatedCloseTime: 0,
            targetCloseTime: 0,
            lastBlinkTime: 0,
            isSpeaking: false,
            isRollingPlaying: false,
        };

        // 播放背景音乐
        playSound("bg", { loop: true, volume: 0.3 });

        // 游戏开始语音
        await speakAndWait("闭双眼开始摇第一个骰子。");
        if (gameState.current.eyeState === "closed") {
            startRolling();
        }
        // 开始倒计时
        gameTimers.current.countdown = setInterval(() => {
            setRemainingTime((prev) => {
                const newTime = prev - 1;
                if (newTime <= 0) {
                    if (totalPointsRef.current >= config.minPoints) {
                        endGame(true);
                    } else {
                        endGame(false);
                    }
                    return 0;
                }
                return newTime;
            });
        }, 1000);
    }, [speakAndWait, playSound]);

    const startRolling = useCallback(() => {
        if (gameState.current.phase !== "rolling") return;
        if (gameState.current.closeEyeStart === 0) {
            gameState.current.closeEyeStart = Date.now();
        }

        gameState.current.eyeState = "closed";

        // 播放摇骰子音效
        if (!gameState.current.isRollingPlaying) {
            playSound("roll", { loop: true });
            gameState.current.isRollingPlaying = true;
        }

        // 设置随机闭眼目标时间（相当于迷宫中的移动时间）
        if (gameState.current.targetCloseTime === 0) {
            const randomTime =
                config.closeEyeTime[
                    Math.floor(Math.random() * config.closeEyeTime.length)
                ];
            gameState.current.targetCloseTime = randomTime * 1000;
        }

        // 检查是否到达完成摇骰子的时间（相当于迷宫的撞墙检查）
        gameTimers.current.rollCheck = setInterval(() => {
            const currentDuration =
                Date.now() - gameState.current.closeEyeStart;
            const totalDuration =
                gameState.current.accumulatedCloseTime + currentDuration;

            if (totalDuration >= gameState.current.targetCloseTime) {
                completeRoll(); // 相当于迷宫的 hitWall()
            }
        }, 100);
    }, [playSound]);

    const stopRolling = useCallback(() => {
        if (gameState.current.phase !== "rolling") return;

        // 停止摇骰子音效
        stopSound("roll");
        gameState.current.isRollingPlaying = false;

        // 清除摇骰子检查定时器
        clearInterval(gameTimers.current.rollCheck);
        gameTimers.current.rollCheck = null;

        // 累加闭眼时间（但不生成点数，因为这是主动停止）
        const closeDuration = Date.now() - gameState.current.closeEyeStart;
        gameState.current.accumulatedCloseTime += closeDuration;
        statsRef.current.closeEyeDuration += closeDuration;
        setStats((prev) => ({
            ...prev,
            closeEyeDuration: statsRef.current.closeEyeDuration,
        }));
        gameState.current.eyeState = "open";
    }, [stopSound]);

    // 相当于迷宫的 hitWall()
    const completeRoll = useCallback(() => {
        // 清除定时器
        clearInterval(gameTimers.current.rollCheck);
        gameTimers.current.rollCheck = null;

        // 停止摇骰子音效
        stopSound("roll");
        gameState.current.isRollingPlaying = false;
        playSound("ready");
        // 累加闭眼时间
        const closeDuration = Date.now() - gameState.current.closeEyeStart;
        gameState.current.accumulatedCloseTime += closeDuration;
        statsRef.current.closeEyeDuration += closeDuration;
        setStats((prev) => ({
            ...prev,
            closeEyeDuration: statsRef.current.closeEyeDuration,
        }));

        // 生成基础骰子点数（只有自动完成时才生成）
        const basePoint = generateDicePoint();
        const newDicePoints = [...dicePointsRef.current];
        newDicePoints[currentDice.current] = basePoint;
        dicePointsRef.current = newDicePoints;
        setDicePoints(newDicePoints);

        // 更新总点数
        const newTotal = newDicePoints.reduce(
            (sum, point) => sum + (point || 0),
            0
        );
        totalPointsRef.current = newTotal;
        setTotalPoints(newTotal);

        setGamePhase("readyRoll");

        // 提示玩家眨眼进入奖励窗口
        gameTimers.current.prompt = setTimeout(() => {
            if (gameState.current.phase === "readyRoll") {
                speak("多次眨眼");
                setGamePhase("throwPrompt");

                gameTimers.current.prompt = setTimeout(() => {
                    if (gameState.current.phase === "throwPrompt") {
                        startBonusWindow();
                    }
                }, config.promptTimeout);
            }
        }, config.voiceDelay);
    }, [speak, stopSound, generateDicePoint, dicePoints, currentDice]);

    const startBonusWindow = useCallback(() => {
        setGamePhase("bonusWindow");
        bonusBlinksRef.current = 0;
        setBonusBlinks(0);
        playSound("timer");

        // 3秒后结束奖励窗口
        gameTimers.current.bonusWindow = setTimeout(() => {
            endBonusWindow();
        }, config.bonusWindowDuration);
    }, [playSound]);

    const endBonusWindow = useCallback(() => {
        stopSound("timer");

        // 计算奖励点数
        const bonusPoints = Math.floor(
            bonusBlinksRef.current * config.bonusPerBlink
        );
        statsRef.current.bonusPoints += bonusPoints;
        setStats((prev) => ({
            ...prev,
            bonusPoints: statsRef.current.bonusPoints,
        }));

        // 更新当前骰子点数
        const newDicePoints = [...dicePointsRef.current];

        newDicePoints[currentDice.current] =
            (newDicePoints[currentDice.current] || 0) + bonusPoints;
        if (newDicePoints[currentDice.current] >= 6) {
            newDicePoints[currentDice.current] = 6;
        }
        dicePointsRef.current = newDicePoints;
        setDicePoints(newDicePoints);

        // 更新总点数
        const newTotal = newDicePoints.reduce(
            (sum, point) => sum + (point || 0),
            0
        );
        totalPointsRef.current = newTotal;
        setTotalPoints(newTotal);
        const isLastDice = currentDice.current === config.switchSequence.length;

        if (isLastDice) {
            setGamePhase("end");
            return;
        }
        // 提示切换方向
        const direction = config.switchSequence[currentDice.current];
        speak(`${direction === "left" ? "左" : "右"}眨`);
        setGamePhase("switching");

        // 如果1秒内没有正确眨眼，提示玩家
        gameTimers.current.prompt = setTimeout(() => {
            if (gameState.current.phase === "switching") {
                const direction = config.switchSequence[currentDice.current];
                speak(`${direction === "left" ? "左" : "右"}眨眼切换`);
            }
        }, config.promptTimeout);
    }, [speak, stopSound]);

    const handleCorrectSwitch = useCallback(() => {
        const direction = config.switchSequence[currentDice.current];
        playSound("switch");

        // 更新统计
        statsRef.current.totalBlinks += 1;
        if (direction === "left") {
            statsRef.current.leftBlinks += 1;
        } else {
            statsRef.current.rightBlinks += 1;
        }
        setStats({ ...statsRef.current });

        // 检查是否完成所有骰子
        if (currentDice.current < config.switchSequence.length) {
            // 重置状态并切换到下一个骰子
            gameState.current.closeEyeStart = 0;
            gameState.current.accumulatedCloseTime = 0;
            gameState.current.targetCloseTime = 0;

            const nextDice = currentDice.current + 1;
            currentDice.current = nextDice;
            setGamePhase("rolling");
            speak(`闭双眼`);
        }
    }, [speak, playSound, currentDice]);

    const handleWrongSwitch = useCallback(() => {
        playSound("wrong");
        statsRef.current.totalBlinks += 1;
        statsRef.current.wrongSwitches += 1;
        setStats({ ...statsRef.current });

        const direction = config.switchSequence[currentDice.current];
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
                totalPoints: totalPointsRef.current,
                dicePoints: dicePointsRef.current,
                mode: "dice",
                timestamp: Date.now(),
            };

            setGamePhase(isSuccess ? "success" : "fail");
            onGameEnd(finalStats);
        },
        [onGameEnd, stopAllSounds, playSound]
    );

    // ================ 事件处理 ================
    const handleBlinkEvent = useCallback(
        (data) => {
            const newTotalBlinks = data.total;
            setBlinkCount(newTotalBlinks);
            statsRef.current.totalBlinks = newTotalBlinks;
            setStats((prev) => ({ ...prev, totalBlinks: newTotalBlinks }));

            // 只在 intro 阶段处理开始游戏
            if (gameState.current.phase === "intro" && newTotalBlinks >= 2) {
                startGame();
                return;
            }

            if (
                gameState.current.phase === "throwPrompt" &&
                newTotalBlinks >= 2
            ) {
                clearTimeout(gameTimers.current.prompt);
                startBonusWindow();
                return;
            }

            // 在 bonusWindow 阶段记录眨眼次数
            if (gameState.current.phase === "bonusWindow") {
                bonusBlinksRef.current += 1;
                setBonusBlinks(bonusBlinksRef.current);
                playSound("levelUp");
            }
        },
        [startGame, startBonusWindow, playSound]
    );

    const handleLeftBlink = useCallback(
        (data) => {
            // 只在特定阶段处理眨眼
            if (
                !["switching", "bonusWindow", "throwPrompt"].includes(
                    gameState.current.phase
                )
            ) {
                return;
            }

            statsRef.current.totalBlinks += 1;
            setStats((prev) => ({
                ...prev,
                totalBlinks: statsRef.current.totalBlinks,
            }));

            if (gameState.current.phase === "switching") {
                const now = Date.now();
                if (now - gameState.current.lastBlinkTime < 300) return;
                gameState.current.lastBlinkTime = now;

                const expectedDirection =
                    config.switchSequence[currentDice.current];
                if (expectedDirection === "left") {
                    handleCorrectSwitch();
                } else {
                    handleWrongSwitch();
                }
            }
        },
        [handleCorrectSwitch, handleWrongSwitch]
    );

    const handleRightBlink = useCallback(
        (data) => {
            // 只在特定阶段处理眨眼
            if (
                !["switching", "bonusWindow", "throwPrompt"].includes(
                    gameState.current.phase
                )
            ) {
                return;
            }

            statsRef.current.totalBlinks += 1;
            setStats((prev) => ({
                ...prev,
                totalBlinks: statsRef.current.totalBlinks,
            }));

            if (gameState.current.phase === "switching") {
                const now = Date.now();
                if (now - gameState.current.lastBlinkTime < 300) return;
                gameState.current.lastBlinkTime = now;

                const expectedDirection =
                    config.switchSequence[currentDice.current];
                if (expectedDirection === "right") {
                    handleCorrectSwitch();
                } else {
                    handleWrongSwitch();
                }
            }
        },
        [handleCorrectSwitch, handleWrongSwitch]
    );

    const handleEyeState = useCallback(
        (data) => {
            if (gameState.current.isSpeaking) return;

            gameState.current.eyeState = data.status;

            if (gameState.current.phase === "rolling") {
                if (data.status === "closed") {
                    if (gameState.current.closeEyeStart === 0) {
                        console.log("首次检测到闭眼，设置开始时间");
                        gameState.current.closeEyeStart = Date.now();
                    }
                    startRolling();
                } else if (
                    data.status === "open" &&
                    gameState.current.closeEyeStart !== 0
                ) {
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

        // 只在首次挂载时播放初始语音
        speak("眨双眼两次开始游戏。");

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
            if (totalPointsRef.current >= config.minPoints) {
                endGame(true);
            } else {
                endGame(false);
            }
        }
    }, [shouldEnd, endGame]);

    // ================ 渲染辅助函数 ================
    const renderGameStateText = () => {
        switch (gamePhase) {
            case "intro":
                return "请眨双眼两次开始游戏";
            case "rolling":
                return "摇骰子中...睁双眼停止";
            case "readyRoll":
                return "摇骰完成，请眨眼两次掷出骰子";
            case "throwPrompt":
                return "请眨双眼两次掷出骰子";
            case "bonusWindow":
                return `快速眨眼增加点数！(${bonusBlinks}次眨眼)`;
            case "switching":
                return `请${
                    config.switchSequence[currentDice.current] === "left"
                        ? "左"
                        : "右"
                }眨眼切换到下一个骰子`;
            case "end":
                return "投掷完毕";
            case "success":
                return "恭喜成功离开骰子空间！";
            case "fail":
                return "很遗憾，未能离开骰子空间";
            default:
                return "";
        }
    };

    // 渲染骰子点数
    const renderDicePoints = () => {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    margin: "10px 0",
                    gap: "15px",
                }}>
                {dicePoints.map((point, index) => (
                    <div
                        key={index}
                        style={{
                            width: "40px",
                            height: "40px",
                            backgroundColor: "#f0f0f0",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            fontSize: "1.2rem",
                            color: "#333",
                            border:
                                currentDice.current === index
                                    ? "3px solid gold"
                                    : "2px solid #ccc",
                            boxShadow:
                                currentDice.current === index
                                    ? "0 0 10px gold"
                                    : "none",
                        }}>
                        {point || "?"}
                    </div>
                ))}
            </div>
        );
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
            }}>
            {/* 等待开始界面（眨双眼两次） */}
            {gamePhase === "intro" && (
                <div>
                    {/* 游戏标题 */}
                    <h1 style={{ marginBottom: "-0.5rem" }}>骰子空间</h1>
                    <p style={{ color: "rgb(255,255,255,0.7)" }}>
                        掷出骰子，点数之和大于14即可离开
                    </p>
                    <p>
                        闭双眼：摇动骰子
                        <br />
                        睁双眼：停止摇动
                        <br />
                        左眨眼：左掷骰子
                        <br />
                        右眨眼：右掷骰子
                    </p>
                    <p
                        style={{
                            marginTop: "2rem",
                            fontSize: "1rem",
                            color: "pink",
                        }}>
                        开始游戏（眨双眼两次）
                        <span style={{ color: "pink" }}>{blinkCount}/2</span>
                    </p>
                </div>
            )}

            {gamePhase !== "intro" &&
                gamePhase !== "success" &&
                gamePhase !== "fail" && (
                    <>
                        <h1>{remainingTime}秒</h1>
                        <h2>
                            总点数: {totalPoints} / {config.minPoints}
                        </h2>

                        {renderDicePoints()}

                        <p>
                            闭双眼：摇动骰子
                            <br />
                            睁双眼：停止摇动
                            <br />
                            左眨眼：左掷骰子
                            <br />
                            右眨眼：右掷骰子
                        </p>
                        <p
                            style={{
                                marginTop: "1rem",
                                fontSize: "1rem",
                                color: "#ffcc00",
                                fontWeight: "bold",
                                backgroundColor: "rgba(0,0,0,0.3)",
                                padding: "8px 16px",
                                borderRadius: "20px",
                                maxWidth: "80%",
                            }}>
                            {renderGameStateText()}
                        </p>
                    </>
                )}

            {(gamePhase === "success" || gamePhase === "fail") && (
                <div
                    style={{
                        padding: "20px",
                        backgroundColor: "rgba(0,0,0,0.7)",
                        borderRadius: "15px",
                        maxWidth: "80%",
                    }}>
                    <h2
                        style={{
                            color:
                                gamePhase === "success" ? "#4caf50" : "#f44336",
                        }}>
                        {gamePhase === "success"
                            ? "恭喜成功离开骰子空间!"
                            : "很遗憾，未能离开骰子空间"}
                    </h2>
                    <p>
                        骰子点数: {dicePoints.join(" + ")} = {totalPoints}
                    </p>
                    <p>目标点数: {config.minPoints}</p>
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
