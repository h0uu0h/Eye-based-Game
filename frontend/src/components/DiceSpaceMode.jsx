/* eslint-disable react/prop-types */
import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import styles from "./DiceSpaceMode.module.css";

// 音效导入
import bgSound from "/sounds/dice/background.mp3"; // 【骰子背景音】
import rollSound from "/sounds/dice/roll.mp3"; // 【摇骰子音效】
import readySound from "/sounds/dice/ready.mp3"; // 【掷骰子音效】
import switchSound from "/sounds/dice/switch.mp3"; // 【骰子切换音效】
import wrongSound from "/sounds/dice/wrong.mp3"; // 【XX音效】(错误提示)
import timerSound from "/sounds/dice/timer.mp3"; // 【计时音效】
import levelUpSound from "/sounds/dice/levelup.mp3"; // 【level up音效】
import victorySound from "/sounds/dice/victory.mp3"; // 【胜利音效】
import failSound from "/sounds/dice/fail.mp3"; // 【失败音效】

const DiceSpaceMode = ({ onGameEnd, shouldEnd }) => {
    // ================ 可配置参数 ================
    const config = {
        diceCount: 4, // 骰子数量 (文档要求4个骰子)
        minPoints: 14, // 目标点数 (文档要求≥14点)
        closeEyeTime: { min: 3000, max: 5000 }, // 闭眼时间范围2-5秒 (3000-5000ms)
        blinkWindow: 3000, // 多次眨眼时间窗口3s (文档要求)
        pointPerBlink: 1, // 每眨眼两次增加1点 (文档要求)
        switchSequence: ["right", "left", "right", "left"], // 切换顺序 (文档示例右左右左)
        voiceDelay: 1000, // 语音提示延迟1s (文档要求)
        totalTime: 30000, // 总游戏时间30s (文档要求)
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

    const [uiState, setUiState] = useState({
        gameState: "intro", // intro, waiting, rolling, pointPhase, switchPhase, ended
        countdown: config.totalTime / 1000,
        currentDice: 0, // 当前骰子索引
        showPrompt: false, // 是否显示提示
        diceRolling: false, // 骰子是否在滚动
        diceValue: 0, // 当前骰子值
        bonusValue: 0, // 奖励点数
        blinkInWindow: 0, // 时间窗口内眨眼次数
    });

    // ================ Refs ================
    const socket = useRef(null);
    const countdownTimerRef = useRef(null);
    const rollTimerRef = useRef(null);
    const readyTimerRef = useRef(null);
    const blinkWindowTimerRef = useRef(null);
    const closeEyeStartRef = useRef(0);
    const lastBlinkTimeRef = useRef(0);

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

    // ================ 核心游戏逻辑 ================
    // 初始化Socket连接
    useEffect(() => {
        socket.current = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
        });

        socket.current.on("blink_event", handleBlinkEvent);
        socket.current.on("eye_state", handleEyeState);

        return () => {
            socket.current.disconnect();
            stopAllSounds();
        };
    }, []);

    // 监听游戏结束信号
    useEffect(() => {
        if (shouldEnd && uiState.gameState !== "ended") {
            endGame(false);
        }
    }, [shouldEnd]);

    // 处理眨眼事件
    const handleBlinkEvent = (data) => {
        gameStatsRef.current.blinkCount = data.total;

        // 在intro状态，眨眼2次开始游戏
        if (uiState.gameState === "intro" && data.total >= 2) {
            startGame();
            return;
        }

        // 在pointPhase状态统计眨眼次数
        if (uiState.gameState === "pointPhase") {
            setUiState((prev) => ({
                ...prev,
                blinkInWindow: prev.blinkInWindow + 1,
                bonusValue: Math.floor((prev.blinkInWindow + 1) / 2),
            }));
            levelUpAudioRef.current.play();
        }

        // 在switchPhase状态处理切换
        if (uiState.gameState === "switchPhase") {
            const now = Date.now();
            if (now - lastBlinkTimeRef.current < 300) return; // 防抖

            lastBlinkTimeRef.current = now;

            // 检查眨眼方向是否正确
            const expectedDirection =
                config.switchSequence[uiState.currentDice];
            if (data.type === expectedDirection) {
                handleCorrectSwitch();
            } else {
                handleWrongSwitch();
            }
        }
    };

    // 处理眼睛状态
    const handleEyeState = (data) => {
        if (uiState.gameState === "waiting" && data.status === "closed") {
            startRolling();
        }

        if (uiState.gameState === "rolling" && data.status === "open") {
            // 如果提前睁眼
            if (
                Date.now() - closeEyeStartRef.current <
                config.closeEyeTime.min
            ) {
                speak("闭双眼继续摇骰子");
            } else {
                stopRolling();
            }
        }
    };

    // 开始游戏
    const startGame = () => {
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

        setUiState({
            gameState: "waiting",
            countdown: config.totalTime / 1000,
            currentDice: 0,
            showPrompt: false,
            diceRolling: false,
            diceValue: 0,
            bonusValue: 0,
            blinkInWindow: 0,
        });

        // 播放背景音乐
        bgAudioRef.current.loop = true;
        bgAudioRef.current.volume = 0.3;
        bgAudioRef.current
            .play()
            .catch((e) => console.warn("背景音乐播放失败:", e));

        // 播放开始语音
        speak(
            "您进入了一个骰子空间，掷出4个骰子并使其点数之和大于14即可离开，闭双眼开始摇第一个骰子，并在听到提示后掷出。"
        );

        // 开始总倒计时
        startCountdown();
    };

    // 开始总倒计时
    const startCountdown = () => {
        countdownTimerRef.current = setInterval(() => {
            setUiState((prev) => {
                const newCountdown = prev.countdown - 1;
                if (newCountdown <= 0) {
                    endGame(false);
                    return { ...prev, countdown: 0 };
                }
                return { ...prev, countdown: newCountdown };
            });
        }, 1000);
    };

    // 开始摇骰子
    const startRolling = () => {
        closeEyeStartRef.current = Date.now();
        rollAudioRef.current.loop = true;
        rollAudioRef.current.play();
        setUiState((prev) => ({ ...prev, diceRolling: true }));

        // 随机时间后可以掷出
        const readyTime =
            config.closeEyeTime.min +
            Math.random() * (config.closeEyeTime.max - config.closeEyeTime.min);

        rollTimerRef.current = setTimeout(() => {
            readyAudioRef.current.play();
            setUiState((prev) => ({ ...prev, showPrompt: true }));

            // 1秒后检查是否睁眼
            readyTimerRef.current = setTimeout(() => {
                if (uiState.gameState === "rolling") {
                    speak("睁双眼掷骰子");
                }
            }, config.voiceDelay);
        }, readyTime);
    };

    // 停止摇骰子
    const stopRolling = () => {
        clearTimeout(rollTimerRef.current);
        clearTimeout(readyTimerRef.current);

        // 记录闭眼时长
        const closeDuration = Date.now() - closeEyeStartRef.current;
        gameStatsRef.current.closeEyeDuration += closeDuration;

        rollAudioRef.current.pause();
        setUiState((prev) => ({
            ...prev,
            diceRolling: false,
            showPrompt: false,
        }));

        // 进入点数阶段
        startPointPhase();
    };

    // 开始点数阶段
    const startPointPhase = () => {
        // 随机生成初始点数 (1-6)
        const initialValue = Math.floor(Math.random() * 6) + 1;

        setUiState((prev) => ({
            ...prev,
            gameState: "pointPhase",
            diceValue: initialValue,
            bonusValue: 0,
            blinkInWindow: 0,
            showPrompt: true,
        }));

        // 提示玩家初始点数
        speak(`初始点数: ${initialValue}点`);

        // 1秒后提示眨眼增加点数
        readyTimerRef.current = setTimeout(() => {
            if (uiState.gameState === "pointPhase") {
                speak("眨双眼多次增加点数");
                startBlinkWindow();
            }
        }, config.voiceDelay);
    };

    // 开始眨眼时间窗口
    const startBlinkWindow = () => {
        timerAudioRef.current.play();

        // 设置时间窗口
        blinkWindowTimerRef.current = setTimeout(() => {
            endBlinkWindow();
        }, config.blinkWindow);
    };

    // 结束眨眼时间窗口
    const endBlinkWindow = () => {
        timerAudioRef.current.pause();

        // 计算最终点数
        const finalValue = uiState.diceValue + uiState.bonusValue;
        gameStatsRef.current.dicePoints[uiState.currentDice] = finalValue;
        gameStatsRef.current.totalPoints += finalValue;
        gameStatsRef.current.bonusPoints += uiState.bonusValue;

        // 提示最终点数
        speak(`最终点数: ${finalValue}点`);

        // 进入切换阶段
        setUiState((prev) => ({
            ...prev,
            gameState: "switchPhase",
            showPrompt: true,
        }));

        // 提示切换方向
        const direction = config.switchSequence[uiState.currentDice];
        speak(`${direction === "left" ? "左" : "右"}眨切换`);

        // 1秒后检查是否切换
        readyTimerRef.current = setTimeout(() => {
            if (uiState.gameState === "switchPhase") {
                speak(
                    `${direction === "left" ? "左" : "右"}眨眼切换下一个骰子`
                );
            }
        }, config.voiceDelay);
    };

    // 处理正确切换
    const handleCorrectSwitch = () => {
        clearTimeout(readyTimerRef.current);
        switchAudioRef.current.play();

        // 更新统计数据
        const direction = config.switchSequence[uiState.currentDice];
        if (direction === "left") {
            gameStatsRef.current.leftBlinks++;
        } else {
            gameStatsRef.current.rightBlinks++;
        }

        // 检查是否是最后一个骰子
        if (uiState.currentDice >= config.diceCount - 1) {
            endGame(true);
        } else {
            // 进入下一个骰子
            setUiState((prev) => ({
                ...prev,
                currentDice: prev.currentDice + 1,
                gameState: "waiting",
                showPrompt: false,
            }));

            // 提示开始下一个骰子
            speak("闭双眼开始摇骰子");
        }
    };

    // 处理错误切换
    const handleWrongSwitch = () => {
        wrongAudioRef.current.play();
        gameStatsRef.current.wrongSwitches++;
        const direction = config.switchSequence[uiState.currentDice];
        speak(`${direction === "left" ? "左" : "右"}眨眼切换下一个骰子`);
    };

    // 结束游戏
    const endGame = useCallback(
        (isSuccess) => {
            // 清理所有计时器
            clearInterval(countdownTimerRef.current);
            clearTimeout(rollTimerRef.current);
            clearTimeout(readyTimerRef.current);
            clearTimeout(blinkWindowTimerRef.current);

            // 停止所有音效
            stopAllSounds();

            // 播放结束音效
            if (
                isSuccess &&
                gameStatsRef.current.totalPoints >= config.minPoints
            ) {
                victoryAudioRef.current.play();
                speak(`恭喜！总点数${gameStatsRef.current.totalPoints}点`);
            } else {
                failAudioRef.current.play();
                speak(`游戏结束！总点数${gameStatsRef.current.totalPoints}点`);
            }

            // 更新UI状态
            setUiState((prev) => ({ ...prev, gameState: "ended" }));

            // 准备结算数据
            const finalStats = {
                ...gameStatsRef.current,
                isSuccess:
                    isSuccess &&
                    gameStatsRef.current.totalPoints >= config.minPoints,
                totalPoints: gameStatsRef.current.totalPoints,
                mode: "dice",
                timestamp: Date.now(),
            };

            // 触发结算回调
            onGameEnd(finalStats);
        },
        [onGameEnd]
    );

    // 停止所有音效
    const stopAllSounds = () => {
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
    };

    // 语音播报
    const speak = (text) => {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        window.speechSynthesis.speak(utterance);
    };

    // 渲染骰子
    const renderDice = (value, index, isCurrent) => {
        const dots = [];
        for (let i = 0; i < value; i++) {
            dots.push(<div key={i} className={styles.diceDot}></div>);
        }

        return (
            <div
                key={index}
                className={`${styles.dice} ${isCurrent ? styles.current : ""}`}>
                <div className={styles.diceInner}>{dots}</div>
                {isCurrent && uiState.bonusValue > 0 && (
                    <div className={styles.diceBonus}>
                        +{uiState.bonusValue}
                    </div>
                )}
            </div>
        );
    };

    // ================ 渲染部分 ================
    return (
        <div className={styles.container}>
            {/* 音效资源 */}
            <audio ref={bgAudioRef} src={bgSound} preload="auto" />
            <audio ref={rollAudioRef} src={rollSound} preload="auto" />
            <audio ref={readyAudioRef} src={readySound} preload="auto" />
            <audio ref={switchAudioRef} src={switchSound} preload="auto" />
            <audio ref={wrongAudioRef} src={wrongSound} preload="auto" />
            <audio ref={timerAudioRef} src={timerSound} preload="auto" />
            <audio ref={levelUpAudioRef} src={levelUpSound} preload="auto" />
            <audio ref={victoryAudioRef} src={victorySound} preload="auto" />
            <audio ref={failAudioRef} src={failSound} preload="auto" />

            {/* 介绍界面 */}
            {uiState.gameState === "intro" && (
                <div className={styles.introContainer}>
                    <h1 className={styles.introTitle}>骰子空间(21点)</h1>
                    <div className={styles.rulesContainer}>
                        <h2 className={styles.rulesTitle}>游戏规则</h2>
                        <p className={styles.rulesText}>• 闭眼3-5秒：摇骰子</p>
                        <p className={styles.rulesText}>• 睁眼：停止摇骰子</p>
                        <p className={styles.rulesText}>• 眨眼2次：获取点数</p>
                        <p className={styles.rulesText}>• 多次眨眼：增加点数</p>
                        <p className={styles.rulesText}>
                            • 眨左眼/右眼：切换骰子
                        </p>
                        <p className={styles.rulesGoal}>
                            目标：4个骰子总点数达到14点以上
                        </p>
                    </div>
                    <p className={styles.startPrompt}>眨双眼2次开始游戏</p>
                </div>
            )}

            {/* 游戏进行中界面 */}
            {uiState.gameState !== "intro" && uiState.gameState !== "ended" && (
                <>
                    <div className={styles.timerContainer}>
                        <div>剩余时间: {uiState.countdown}秒</div>
                        <div
                            className={`${styles.statusIndicator} ${
                                uiState.diceRolling ? styles.active : ""
                            }`}></div>
                    </div>

                    <div className={styles.targetPoints}>
                        目标点数: {config.minPoints}点
                    </div>

                    <h2 style={{ marginBottom: "30px" }}>
                        {uiState.currentDice < config.diceCount
                            ? `骰子 ${uiState.currentDice + 1}/${
                                  config.diceCount
                              }`
                            : "游戏结束"}
                    </h2>

                    {/* 骰子容器 */}
                    <div className={styles.diceContainer}>
                        {gameStatsRef.current.dicePoints.map((value, index) =>
                            renderDice(
                                value,
                                index,
                                index === uiState.currentDice
                            )
                        )}
                    </div>

                    {/* 总点数 */}
                    {uiState.currentDice > 0 && (
                        <div className={styles.totalPoints}>
                            当前总点数: {gameStatsRef.current.totalPoints}点
                        </div>
                    )}

                    {/* 时间窗口进度条 */}
                    {uiState.gameState === "pointPhase" && (
                        <div className={styles.progressContainer}>
                            <div
                                className={styles.progressBar}
                                style={{
                                    width: `${
                                        (uiState.blinkInWindow / 12) * 100
                                    }%`,
                                    background:
                                        uiState.blinkInWindow > 6
                                            ? "#2ecc71"
                                            : "#3498db",
                                }}></div>
                        </div>
                    )}

                    {/* 操作提示 */}
                    {uiState.showPrompt && (
                        <div className={styles.promptBox}>
                            {uiState.gameState === "rolling" && (
                                <p>请睁眼掷骰子</p>
                            )}
                            {uiState.gameState === "pointPhase" && (
                                <p>请眨眼增加点数</p>
                            )}
                            {uiState.gameState === "switchPhase" && (
                                <p>
                                    请
                                    {config.switchSequence[
                                        uiState.currentDice
                                    ] === "left"
                                        ? "左"
                                        : "右"}
                                    眨眼切换
                                </p>
                            )}
                        </div>
                    )}

                    {/* 时间窗口内眨眼计数 */}
                    {uiState.gameState === "pointPhase" && (
                        <div className={styles.blinkCount}>
                            已眨眼: {uiState.blinkInWindow}次 (+
                            {uiState.bonusValue}点)
                        </div>
                    )}
                </>
            )}

            {/* 游戏结束界面 */}
            {uiState.gameState === "ended" && (
                <div className={styles.endContainer}>
                    <h1 className={styles.endTitle}>游戏结束</h1>
                    <div className={styles.summaryContainer}>
                        <h2 className={styles.summaryTitle}>
                            正在生成结算信息...
                        </h2>
                        <p>请稍候</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiceSpaceMode;
