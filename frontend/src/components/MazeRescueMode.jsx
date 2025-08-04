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

const MazeRescueMode = ({
    onGameEnd,
    shouldEnd,
    config: incomingConfig = {},
}) => {
    // ================ 游戏配置 ================
    const defaultConfig = {
        closeEyeTime: [1, 2, 3], // 随机闭眼时间 (秒)
        blinkWindowDuration: 2000, // 眨眼奖励窗口时间 (毫秒)
        timeReward: 500, // 每次奖励时间 (毫秒)
        turnSequence: ["right", "left"], // 转向顺序
        voiceDelay: 1000, // 语音提示延迟 (毫秒)
        promptTimeout: 1000, // 操作提示超时 (毫秒)
        totalTime: 20000, // 总游戏时间 (毫秒)
    };
    const config = { ...defaultConfig, ...incomingConfig };

    // ================ 游戏状态 ================
    const [gamePhase, setGamePhase] = useState("intro"); // intro, moving, wallHit, blinkPrompt, blinkWindow, turning, success, fail
    const [remainingTime, setRemainingTime] = useState(config.totalTime / 1000);
    const [blinkCount, setBlinkCount] = useState(0);
    const [blinkInWindow, setBlinkInWindow] = useState(0);
    const [stats, setStats] = useState({
        useTime: 0,
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongTurns: 0,
        closeEyeDuration: 0,
        timeBonus: 0,
    });

    // ================ Refs ================
    const socket = useRef(null);
    const bonusBlinksRef = useRef(0);
    const currentTurn = useRef(0);
    const arriveRef = useRef(false);
    const statsRef = useRef({
        useTime: 0,
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongTurns: 0,
        closeEyeDuration: 0,
        timeBonus: 0,
    });
    const gameTimers = useRef({
        countdown: null,
        move: null,
        prompt: null,
        blinkWindow: null,
        wallCheck: null,
    });
    const gameState = useRef({
        phase: "intro",
        eyeState: "open",
        gameStart: 0,
        closeEyeStart: 0,
        accumulatedCloseTime: 0,
        targetCloseTime: 0,
        lastBlinkTime: 0,
        isSpeaking: false,
        isFootstepPlaying: false,
    });

    // 同步ref状态
    useEffect(() => {
        gameState.current.phase = gamePhase;
    }, [gamePhase]);

    // 音效Refs
    const audioRefs = useRef({
        bg: null,
        footstep: null,
        wall: null,
        turn: null,
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
        setGamePhase("moving");
        currentTurn.current = 0;
        setRemainingTime(config.totalTime / 1000);
        setBlinkCount(0);
        bonusBlinksRef.current = 0;
        setBlinkInWindow(0);
        statsRef.current = {
            useTime: 0,
            totalBlinks: 0,
            leftBlinks: 0,
            rightBlinks: 0,
            wrongTurns: 0,
            closeEyeDuration: 0,
            timeBonus: 0,
        };
        setStats(statsRef.current); // 刷新界面

        gameState.current = {
            ...gameState.current,
            phase: "moving",
            eyeState: "open",
            closeEyeStart: 0,
            accumulatedCloseTime: 0,
            targetCloseTime: 0,
            lastBlinkTime: 0,
            isSpeaking: false,
            isFootstepPlaying: false,
        };

        // 播放背景音乐
        playSound("bg", { loop: true, volume: 0.3 });

        // 游戏开始语音
        await speakAndWait("闭双眼开始第一段前行。");

        gameState.current.gameStart = Date.now();
        if (gameState.current.eyeState === "closed") {
            startMoving();
        }
        // 开始倒计时
        gameTimers.current.countdown = setInterval(() => {
            setRemainingTime((prev) => {
                const newTime = prev - 1;
                if (newTime <= 0) {
                    endGame(arriveRef.current);
                    return 0;
                }
                return newTime;
            });
        }, 1000);
    }, [speakAndWait, playSound]);

    const startMoving = useCallback(() => {
        if (gameState.current.phase !== "moving") return;

        // 记录闭眼开始时间
        if (gameState.current.closeEyeStart === 0) {
            gameState.current.closeEyeStart = Date.now();
        }
        gameState.current.eyeState = "closed";

        // 播放脚步声
        if (!gameState.current.isFootstepPlaying) {
            playSound("footstep", { loop: true });
            gameState.current.isFootstepPlaying = true;
        }

        // 设置随机闭眼目标时间
        if (gameState.current.targetCloseTime === 0) {
            const randomTime =
                config.closeEyeTime[
                    Math.floor(Math.random() * config.closeEyeTime.length)
                ];
            gameState.current.targetCloseTime = randomTime * 1000;
        }

        // 检查是否到达撞墙时间
        gameTimers.current.wallCheck = setInterval(() => {
            const currentDuration =
                Date.now() - gameState.current.closeEyeStart;
            const totalDuration =
                gameState.current.accumulatedCloseTime + currentDuration;

            if (totalDuration >= gameState.current.targetCloseTime) {
                hitWall();
            }
        }, 100);
    }, [playSound]);

    const stopMoving = useCallback(() => {
        if (gameState.current.phase !== "moving") return;

        // 停止脚步声
        stopSound("footstep");
        gameState.current.isFootstepPlaying = false;

        // 清除撞墙检查定时器
        clearInterval(gameTimers.current.wallCheck);
        gameTimers.current.wallCheck = null;

        // 累加闭眼时间
        const closeDuration = Date.now() - gameState.current.closeEyeStart;
        gameState.current.accumulatedCloseTime += closeDuration;
        statsRef.current.closeEyeDuration += closeDuration;
        setStats((prev) => ({
            ...prev,
            closeEyeDuration: statsRef.current.closeEyeDuration,
        }));

        gameState.current.eyeState = "open";
    }, [stopSound]);

    const hitWall = useCallback(() => {
        // 清除定时器
        clearInterval(gameTimers.current.wallCheck);
        gameTimers.current.wallCheck = null;

        // 停止脚步声
        stopSound("footstep");
        gameState.current.isFootstepPlaying = false;

        // 播放撞墙音效
        playSound("wall");

        // 累加闭眼时间
        const closeDuration = Date.now() - gameState.current.closeEyeStart;
        gameState.current.accumulatedCloseTime += closeDuration;
        statsRef.current.closeEyeDuration += closeDuration;
        setStats((prev) => ({
            ...prev,
            closeEyeDuration: statsRef.current.closeEyeDuration,
        }));

        setGamePhase("wallHit");

        // 提示玩家眨眼进入奖励窗口
        gameTimers.current.prompt = setTimeout(() => {
            if (gameState.current.phase === "wallHit") {
                speak("多次眨眼");
                setGamePhase("blinkPrompt");

                // 如果1秒内没有眨眼两次，自动进入奖励窗口
                gameTimers.current.prompt = setTimeout(() => {
                    if (gameState.current.phase === "blinkPrompt") {
                        startBlinkWindow();
                    }
                }, config.promptTimeout);
            }
        }, config.voiceDelay);
    }, [speak, playSound, stopSound]);

    const startBlinkWindow = useCallback(() => {
        setGamePhase("blinkWindow");
        setBlinkInWindow(0);
        bonusBlinksRef.current = 0;
        playSound("timer");

        // 3秒后结束奖励窗口
        gameTimers.current.blinkWindow = setTimeout(() => {
            const isLastTurn =
                currentTurn.current === config.turnSequence.length;
            if (isLastTurn) {
                statsRef.current.useTime =
                    Date.now() - gameState.current.gameStart;
                console.log("sss", statsRef.current.useTime);
                arriveRef.current = true;
            }
            endBlinkWindow();
        }, config.blinkWindowDuration);
    }, [playSound]);

    const endBlinkWindow = useCallback(() => {
        stopSound("timer");

        // 计算时间奖励
        const bonus =
            Math.floor(bonusBlinksRef.current / 2) * config.timeReward * 2;
        statsRef.current.timeBonus += bonus;
        setStats((prev) => ({
            ...prev,
            timeBonus: statsRef.current.timeBonus,
        }));
        const isLastTurn = currentTurn.current === config.turnSequence.length;

        if (isLastTurn) {
            setGamePhase("end");
            return;
        }
        // 更新剩余时间
        // setRemainingTime((prev) => prev + bonus / 1000);

        // 提示转向方向
        const direction = config.turnSequence[currentTurn.current];
        speak(`${direction === "left" ? "左" : "右"}转`);
        setGamePhase("turning");

        // 如果1秒内没有正确眨眼，提示玩家
        gameTimers.current.prompt = setTimeout(() => {
            if (gameState.current.phase === "turning") {
                const direction = config.turnSequence[currentTurn.current];
                speak(
                    `${direction === "left" ? "左" : "右"}眨眼${
                        direction === "left" ? "左" : "右"
                    }转`
                );
            }
        }, config.promptTimeout);
    }, [speak, stopSound, currentTurn, blinkInWindow]);

    const handleCorrectTurn = useCallback(() => {
        const direction = config.turnSequence[currentTurn.current];
        playSound("turn");

        // 更新统计
        statsRef.current.totalBlinks += 1;
        if (direction === "left") {
            statsRef.current.leftBlinks += 1;
        } else {
            statsRef.current.rightBlinks += 1;
        }
        setStats({ ...statsRef.current });

        if (currentTurn.current < config.turnSequence.length) {
            // 重置移动状态
            gameState.current.closeEyeStart = 0;
            gameState.current.accumulatedCloseTime = 0;
            gameState.current.targetCloseTime = 0;

            currentTurn.current += 1;
            setGamePhase("moving");
            speak("闭双眼");
        }
    }, [speak, playSound]);

    const handleWrongTurn = useCallback(() => {
        playSound("wrong");
        statsRef.current.totalBlinks += 1;
        statsRef.current.wrongTurns += 1;
        setStats({ ...statsRef.current });

        const direction = config.turnSequence[currentTurn.current];
        speak(
            `${direction === "left" ? "左" : "右"}眨眼${
                direction === "left" ? "左" : "右"
            }转`
        );
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
                finalTime:
                    (statsRef.current.useTime - statsRef.current.timeBonus) /
                    1000,
                mode: "maze",
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
                gameState.current.phase === "blinkPrompt" &&
                newTotalBlinks >= 2
            ) {
                clearTimeout(gameTimers.current.prompt);
                startBlinkWindow();
                return;
            }

            // 在 blinkWindow 阶段记录眨眼次数
            if (gameState.current.phase === "blinkWindow") {
                bonusBlinksRef.current += 1;
                setBlinkInWindow(bonusBlinksRef.current);
                playSound("levelUp");
            }
        },
        [startGame, startBlinkWindow, playSound]
    );

    // 修改 handleLeftBlink 和 handleRightBlink 函数
    const handleLeftBlink = useCallback(
        (data) => {
            // 只在特定阶段处理眨眼
            if (
                !["turning", "blinkWindow", "blinkPrompt"].includes(
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

            if (gameState.current.phase === "turning") {
                const now = Date.now();
                if (now - gameState.current.lastBlinkTime < 300) return;
                gameState.current.lastBlinkTime = now;

                const expectedDirection =
                    config.turnSequence[currentTurn.current];
                if (expectedDirection === "left") {
                    handleCorrectTurn();
                } else {
                    handleWrongTurn();
                }
            }
        },
        [handleCorrectTurn, handleWrongTurn]
    );

    const handleRightBlink = useCallback(
        (data) => {
            // 只在特定阶段处理眨眼
            if (
                !["turning", "blinkWindow", "blinkPrompt"].includes(
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

            if (gameState.current.phase === "turning") {
                const now = Date.now();
                if (now - gameState.current.lastBlinkTime < 300) return;
                gameState.current.lastBlinkTime = now;

                const expectedDirection =
                    config.turnSequence[currentTurn.current];
                if (expectedDirection === "right") {
                    handleCorrectTurn();
                } else {
                    handleWrongTurn();
                }
            }
        },
        [handleCorrectTurn, handleWrongTurn]
    );

    const handleEyeState = useCallback(
        (data) => {
            if (gameState.current.isSpeaking) return;

            gameState.current.eyeState = data.status;

            if (gameState.current.phase === "moving") {
                if (data.status === "closed") {
                    if (gameState.current.closeEyeStart === 0) {
                        gameState.current.closeEyeStart = Date.now();
                    }
                    startMoving();
                } else if (
                    data.status === "open" &&
                    gameState.current.closeEyeStart !== 0
                ) {
                    stopMoving();
                }
            }
        },
        [startMoving, stopMoving]
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
            endGame(arriveRef.current);
        }
    }, [shouldEnd, endGame]);

    // ================ 渲染辅助函数 ================
    const renderGameStateText = () => {
        switch (gamePhase) {
            case "intro":
                return "请眨双眼两次开始游戏";
            case "moving":
                return gameState.current.eyeState === "closed"
                    ? "移动中...睁双眼停止"
                    : "请闭双眼开始移动";
            case "wallHit":
                return "到达路口，请睁双眼";
            case "blinkPrompt":
                return "请眨双眼两次获取方向提示";
            case "blinkWindow":
                return `快速眨眼获取时间奖励！(${blinkInWindow}次)`;
            case "turning":
                return `请${
                    config.turnSequence[currentTurn.current] === "left"
                        ? "左"
                        : "右"
                }眨眼转向`;
            case "end":
                return "救援成功！";
            case "success":
                return "救援成功！";
            case "fail":
                return "救援失败";
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
            }}>
            {/* 游戏标题 */}
            <h1 style={{ marginBottom: "-0.5rem" }}>迷宫救援</h1>
            <p style={{ color: "rgb(255,255,255,0.7)" }}>
                根据语音提示完成迷宫救援任务
            </p>

            {/* 等待开始界面（眨双眼两次） */}
            {gamePhase === "intro" && (
                <div>
                    <p>
                        闭双眼：向前移动
                        <br />
                        睁双眼：停止移动
                        <br />
                        左眨眼：左转
                        <br />
                        右眨眼：右转
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
                        <p>
                            闭双眼：向前移动
                            <br />
                            睁双眼：停止移动
                            <br />
                            左眨眼：左转
                            <br />
                            右眨眼：右转
                        </p>
                        <p
                            style={{
                                marginTop: "2rem",
                                fontSize: "1rem",
                                color: "pink",
                            }}>
                            {renderGameStateText()}
                        </p>
                    </>
                )}

            {(gamePhase === "success" || gamePhase === "fail") && (
                <div className="end-panel">
                    <h2>
                        {gamePhase === "success" ? "救援成功!" : "救援失败"}
                    </h2>
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
                    ref={(el) => (audioRefs.current.footstep = el)}
                    src={footstepSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.wall = el)}
                    src={wallSound}
                    preload="auto"
                />
                <audio
                    ref={(el) => (audioRefs.current.turn = el)}
                    src={turnSound}
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

export default MazeRescueMode;
