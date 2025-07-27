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
        closeEyeTime: [2000, 3000, 4000, 5000], // 闭眼时间范围
        blinkWindow: 3000, // 眨眼时间窗口
        pointPerBlink: 1, // 每眨眼两次增加1点
        switchSequence: ["right", "left", "right", "left"], // 切换顺序
        voiceDelay: 1000, // 语音延迟
        totalTime: 30000, // 总游戏时间
    };

    // ================ 状态管理 ================
    const gameStatsRef = useRef({
        totalPoints: 0,
        dicePoints: Array(config.diceCount).fill(0),
        blinkCount: 0,
        leftBlinks: 0,
        rightBlinks: 0,
        wrongSwitches: 0,
        closeEyeDuration: 0,
        bonusPoints: 0,
    });

    const [gameState, setGameState] = useState("intro"); // intro, waiting, rolling, pointPhase, switchPhase, ended
    const [currentDice, setCurrentDice] = useState(0);
    const [remainingTime, setRemainingTime] = useState(config.totalTime / 1000);
    const [blinkCount, setBlinkCount] = useState(0);
    const [leftBlinks, setLeftBlinks] = useState(0);
    const [rightBlinks, setRightBlinks] = useState(0);
    const [wrongSwitches, setWrongSwitches] = useState(0);
    const [eyeState, setEyeState] = useState("open");
    const [diceValue, setDiceValue] = useState(0);
    const [bonusValue, setBonusValue] = useState(0);
    const [blinkInWindow, setBlinkInWindow] = useState(0);

    // ================ Refs ================
    const socket = useRef(null);
    const countdownTimerRef = useRef(null);
    const rollTimerRef = useRef(null);
    const readyTimerRef = useRef(null);
    const blinkWindowTimerRef = useRef(null);
    const closeEyeStartRef = useRef(0);
    const lastBlinkTimeRef = useRef(0);
    const startGameDebounceRef = useRef(null);
    const gameStateRef = useRef(gameState);
    const currentDiceRef = useRef(currentDice);
    const diceValueRef = useRef(diceValue);
    const bonusValueRef = useRef(bonusValue);
    const blinkInWindowRef = useRef(blinkInWindow);
    const isRollingPlayingRef = useRef(false);
    const closeEyeTimeTargetRef = useRef(0); // 当前目标闭眼时长
    const closeEyeCheckTimerRef = useRef(null); // 闭眼时长检测定时器
    const accumulatedCloseEyeTimeRef = useRef(0); // 累计闭眼时间

    // 同步ref状态
    useEffect(() => {
        gameStateRef.current = gameState;
        currentDiceRef.current = currentDice;
        diceValueRef.current = diceValue;
        bonusValueRef.current = bonusValue;
        blinkInWindowRef.current = blinkInWindow;
    }, [gameState, currentDice, diceValue, bonusValue, blinkInWindow]);

    // 音效Refs
    const bgAudioRef = useRef(null);
    const rollAudioRef = useRef(null);
    const readyAudioRef = useRef(null);
    const switchAudioRef = useRef(null);
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

    const speakAndWait = useCallback(async (text) => {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) return resolve();

            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "zh-CN";
            utterance.onend = () => setTimeout(resolve, 200);
            window.speechSynthesis.speak(utterance);
        });
    }, []);

    const stopAllSounds = useCallback(() => {
        [
            bgAudioRef,
            rollAudioRef,
            readyAudioRef,
            switchAudioRef,
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
    const startGame = useCallback(async () => {
        if (gameStateRef.current !== "intro") return;

        // 重置游戏数据
        gameStatsRef.current = {
            totalPoints: 0,
            dicePoints: Array(config.diceCount).fill(0),
            blinkCount: 0,
            leftBlinks: 0,
            rightBlinks: 0,
            wrongSwitches: 0,
            closeEyeDuration: 0,
            bonusPoints: 0,
        };
        setCurrentDice(0);
        setGameState("waiting");
        setRemainingTime(config.totalTime / 1000);
        setBlinkCount(0);
        setLeftBlinks(0);
        setRightBlinks(0);
        setWrongSwitches(0);
        setDiceValue(0);
        setBonusValue(0);
        setBlinkInWindow(0);
        accumulatedCloseEyeTimeRef.current = 0;
        closeEyeTimeTargetRef.current = 0;

        // 播放背景音乐
        bgAudioRef.current.loop = true;
        bgAudioRef.current.volume = 0.3;
        bgAudioRef.current.play().catch(console.warn);

        // 游戏开始语音
        await speakAndWait(
            "您进入了一个骰子空间，掷出4个骰子并使其点数之和大于14即可离开，闭双眼开始摇第一个骰子，并在听到提示后掷出。"
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
        }, 1000);
    }, [speakAndWait]);

    const startRolling = useCallback(() => {
        if (gameStateRef.current !== "waiting") return;

        // 记录闭眼起始时间
        closeEyeStartRef.current = Date.now();

        // 启动摇骰子音效
        if (!isRollingPlayingRef.current) {
            rollAudioRef.current.loop = true;
            rollAudioRef.current
                .play()
                .then(() => {
                    isRollingPlayingRef.current = true;
                })
                .catch((e) => {
                    console.warn("Rolling play error:", e);
                });
        }

        // 进入 rolling 状态
        setGameState("rolling");

        // 只生成一次目标闭眼时间
        if (!closeEyeTimeTargetRef.current) {
            closeEyeTimeTargetRef.current =
                config.closeEyeTime[
                    Math.floor(Math.random() * config.closeEyeTime.length)
                ];
        }

        // 设置闭眼时长检测定时器
        if (!closeEyeCheckTimerRef.current) {
            closeEyeCheckTimerRef.current = setInterval(() => {
                const now = Date.now();
                const currentDuration = now - closeEyeStartRef.current;
                const totalDuration =
                    accumulatedCloseEyeTimeRef.current + currentDuration;

                if (totalDuration >= closeEyeTimeTargetRef.current) {
                    // 达到目标闭眼时间
                    clearInterval(closeEyeCheckTimerRef.current);
                    closeEyeCheckTimerRef.current = null;

                    readyAudioRef.current.play();
                    speak("睁双眼掷骰子");
                }
            }, 100); // 每100ms检查一次
        }
    }, [speak]);

    const stopRolling = useCallback(() => {
        if (gameStateRef.current !== "rolling") return;

        // 停止摇骰子音效
        if (isRollingPlayingRef.current) {
            rollAudioRef.current.pause();
            rollAudioRef.current.currentTime = 0;
            isRollingPlayingRef.current = false;
        }

        // 清除定时器
        if (closeEyeCheckTimerRef.current) {
            clearInterval(closeEyeCheckTimerRef.current);
            closeEyeCheckTimerRef.current = null;
        }

        // 累加闭眼时间
        const closeDuration = Date.now() - closeEyeStartRef.current;
        accumulatedCloseEyeTimeRef.current += closeDuration;
        gameStatsRef.current.closeEyeDuration += closeDuration;

        // 检查是否达到目标闭眼时间
        if (
            accumulatedCloseEyeTimeRef.current >= closeEyeTimeTargetRef.current
        ) {
            // 达到目标时间，生成点数
            const initialValue = Math.floor(Math.random() * 6) + 1;
            setDiceValue(initialValue);
            setBonusValue(0);
            setBlinkInWindow(0);

            // 进入点数阶段
            setGameState("pointPhase");
            speak(`初始点数: ${initialValue}点`);

            // 1秒后开始眨眼窗口
            readyTimerRef.current = setTimeout(() => {
                if (gameStateRef.current === "pointPhase") {
                    startBlinkWindow();
                }
            }, config.voiceDelay);
        } else {
            // 未达到目标时间，提示继续闭眼
            speak("闭双眼继续摇骰子");
            setGameState("waiting");
        }
    }, [speak]);

    const startBlinkWindow = useCallback(() => {
        setGameState("blinkWindow");
        setBlinkInWindow(0);
        timerAudioRef.current.play();

        speak("眨眼多次增加点数");

        blinkWindowTimerRef.current = setTimeout(() => {
            endBlinkWindow();
        }, config.blinkWindow);
    }, [speak]);

    const endBlinkWindow = useCallback(() => {
        timerAudioRef.current.pause();
        setGameState("pointPhase");

        // 计算最终点数
        const finalValue = diceValueRef.current + bonusValueRef.current;
        gameStatsRef.current.dicePoints[currentDiceRef.current] = finalValue;
        gameStatsRef.current.totalPoints += finalValue;
        gameStatsRef.current.bonusPoints += bonusValueRef.current;

        speak(`最终点数: ${finalValue}点`);

        // 进入切换阶段
        setGameState("switchPhase");

        const direction = config.switchSequence[currentDiceRef.current];
        speak(`${direction === "left" ? "左" : "右"}眨切换下一个骰子`);

        // 1秒后检查是否切换
        readyTimerRef.current = setTimeout(() => {
            if (gameStateRef.current === "switchPhase") {
                const direction = config.switchSequence[currentDiceRef.current];
                speak(`${direction === "left" ? "左" : "右"}眨眼切换`);
            }
        }, config.voiceDelay);
    }, [speak]);

    const handleCorrectSwitch = useCallback(() => {
        switchAudioRef.current.play();

        // 更新统计
        const direction = config.switchSequence[currentDiceRef.current];
        if (direction === "left") {
            setLeftBlinks((prev) => prev + 1);
            gameStatsRef.current.leftBlinks++;
        } else {
            setRightBlinks((prev) => prev + 1);
            gameStatsRef.current.rightBlinks++;
        }

        // 检查是否完成
        if (currentDiceRef.current >= config.diceCount - 1) {
            endGame(true);
        } else {
            // 重置闭眼相关状态
            accumulatedCloseEyeTimeRef.current = 0;
            closeEyeTimeTargetRef.current = 0;

            setCurrentDice((prev) => prev + 1);
            setGameState("waiting");
            speak("闭双眼开始摇骰子");
        }
    }, [speak]);

    const handleWrongSwitch = useCallback(() => {
        wrongAudioRef.current.play();
        setWrongSwitches((prev) => prev + 1);
        gameStatsRef.current.wrongSwitches++;

        const direction = config.switchSequence[currentDiceRef.current];
        speak(`${direction === "left" ? "左" : "右"}眨眼切换`);
    }, [speak]);

    const endGame = useCallback(
        (isSuccess) => {
            // 清理所有计时器
            clearInterval(countdownTimerRef.current);
            clearTimeout(rollTimerRef.current);
            clearTimeout(readyTimerRef.current);
            clearTimeout(blinkWindowTimerRef.current);
            clearTimeout(startGameDebounceRef.current);
            if (closeEyeCheckTimerRef.current) {
                clearInterval(closeEyeCheckTimerRef.current);
                closeEyeCheckTimerRef.current = null;
            }

            // 停止所有音效
            stopAllSounds();

            // 播放结束音效
            const isVictory =
                isSuccess &&
                gameStatsRef.current.totalPoints >= config.minPoints;
            if (isVictory) {
                victoryAudioRef.current.play();
                speak(`恭喜！总点数${gameStatsRef.current.totalPoints}点`);
            } else {
                failAudioRef.current.play();
                speak(`游戏结束！总点数${gameStatsRef.current.totalPoints}点`);
            }

            // 准备结算数据
            const finalStats = {
                ...gameStatsRef.current,
                isSuccess: isVictory,
                totalPoints: gameStatsRef.current.totalPoints,
                mode: "dice",
                timestamp: Date.now(),
            };

            setGameState("ended");
            onGameEnd(finalStats);
        },
        [onGameEnd, stopAllSounds, speak]
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

            // 点数窗口
            if (gameStateRef.current === "blinkWindow") {
                setBlinkInWindow((prev) => prev + 1);
                setBonusValue(Math.floor((blinkInWindowRef.current + 1) / 2));
                levelUpAudioRef.current.play();
            }
        },
        [startGame]
    );

    const handleEyeState = useCallback(
        (data) => {
            setEyeState(data.status);
            if (
                gameStateRef.current === "waiting" &&
                data.status === "closed"
            ) {
                startRolling();
            } else if (
                gameStateRef.current === "rolling" &&
                data.status === "open"
            ) {
                stopRolling();
            }
        },
        [startRolling, stopRolling]
    );

    const handleLeftBlink = useCallback(
        (data) => {
            setBlinkCount((prev) => prev + 1);
            gameStatsRef.current.blinkCount++;

            if (gameStateRef.current === "switchPhase") {
                const now = Date.now();
                if (now - lastBlinkTimeRef.current < 300) return;
                lastBlinkTimeRef.current = now;

                const expectedDirection =
                    config.switchSequence[currentDiceRef.current];
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
            setBlinkCount((prev) => prev + 1);
            gameStatsRef.current.blinkCount++;

            if (gameStateRef.current === "switchPhase") {
                const now = Date.now();
                if (now - lastBlinkTimeRef.current < 300) return;
                lastBlinkTimeRef.current = now;

                const expectedDirection =
                    config.switchSequence[currentDiceRef.current];
                if (expectedDirection === "right") {
                    handleCorrectSwitch();
                } else {
                    handleWrongSwitch();
                }
            }
        },
        [handleCorrectSwitch, handleWrongSwitch]
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
                    ? "摇骰子中...闭双眼继续"
                    : "请闭双眼开始摇骰子";
            case "rolling":
                return "摇骰子中...睁双眼停止";
            case "pointPhase":
                return "点数阶段";
            case "blinkWindow":
                return `快速眨眼增加点数！(${blinkInWindow}次)`;
            case "switchPhase":
                return "请选择切换方向";
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
                color: "white",
                textAlign: "center",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
            }}>
            {/* 游戏标题 */}
            <h1 style={{ marginBottom: "-0.5rem" }}>骰子空间</h1>
            <p style={{ color: "rgb(255,255,255,0.7)" }}>
                根据语音提示完成骰子游戏
            </p>

            {/* 等待开始界面（眨双眼两次） */}
            {gameState === "intro" && (
                <div>
                    <p>
                        闭双眼：摇骰子
                        <br />
                        睁双眼：停止摇骰子
                        <br />
                        左眨眼：左切换
                        <br />
                        右眨眼：右切换
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

            {/* 游戏进行中界面 */}
            {gameState !== "intro" && gameState !== "ended" && (
                <>
                    <h1>{remainingTime}秒</h1>
                    <p>
                        当前骰子: {currentDice + 1}/{config.diceCount}
                        <br />
                        当前点数: {diceValue} + {bonusValue} ={" "}
                        {diceValue + bonusValue}
                        {currentDice > 0 && (
                            <>
                                <br />
                                总点数: {gameStatsRef.current.totalPoints}
                            </>
                        )}
                    </p>
                    <p
                        style={{
                            marginTop: "2rem",
                            fontSize: "1rem",
                            color: "pink",
                        }}>
                        {renderGameState()}
                    </p>
                </>
            )}

            {gameState === "ended" && (
                <div>
                    <h2>游戏结束!</h2>
                    <p>正在生成结算信息...</p>
                </div>
            )}

            {/* 隐藏的音效元素 */}
            <div style={{ display: "none" }}>
                <audio ref={bgAudioRef} src={bgSound} preload="auto" />
                <audio ref={rollAudioRef} src={rollSound} preload="auto" />
                <audio ref={readyAudioRef} src={readySound} preload="auto" />
                <audio ref={switchAudioRef} src={switchSound} preload="auto" />
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

export default DiceSpaceMode;
