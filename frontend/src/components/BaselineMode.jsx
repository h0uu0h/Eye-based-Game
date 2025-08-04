/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const BaselineMode = ({
    onGameEnd,
    shouldEnd,
    config: incomingConfig = {},
}) => {
    const defaultConfig = {
        countdownDuration: 20,
        voiceDelay: 1000,
    };
    const config = { ...defaultConfig, ...incomingConfig };
    const [gamePhase, setGamePhase] = useState("intro");
    const [remainingTime, setRemainingTime] = useState(
        config.countdownDuration
    );
    const [blinkCount, setBlinkCount] = useState(0);
    const [stats, setStats] = useState({
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
    });

    const socket = useRef(null);
    const statsRef = useRef({
        totalBlinks: 0,
        leftBlinks: 0,
        rightBlinks: 0,
    });
    const gameTimers = useRef({
        countdown: null,
    });
    const gameState = useRef({
        phase: "intro",
        isSpeaking: false,
    });

    useEffect(() => {
        gameState.current.phase = gamePhase;
    }, [gamePhase]);

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

    const startBaseline = useCallback(async () => {
        if (gameState.current.phase !== "intro") return;

        Object.values(gameTimers.current).forEach((timer) => {
            if (timer) clearTimeout(timer);
        });

        setGamePhase("countdown");
        setRemainingTime(config.countdownDuration);
        setBlinkCount(0);

        statsRef.current = {
            totalBlinks: 0,
            leftBlinks: 0,
            rightBlinks: 0,
        };
        setStats(statsRef.current);

        gameState.current = {
            ...gameState.current,
            phase: "countdown",
            isSpeaking: false,
        };

        await speakAndWait(
            "请自由放松眼睛。"
        );

        gameTimers.current.countdown = setInterval(() => {
            setRemainingTime((prev) => {
                const newTime = prev - 1;
                if (newTime <= 0) {
                    endBaseline();
                    return 0;
                }
                return newTime;
            });
        }, 1000);
    }, [speakAndWait]);

    const endBaseline = useCallback(() => {
        Object.values(gameTimers.current).forEach((timer) => {
            if (timer) clearTimeout(timer);
        });

        speak("放松时间结束");

        const finalStats = {
            ...statsRef.current,
            isSuccess: true,
            mode: "baseline",
            timestamp: Date.now(),
            duration: config.countdownDuration,
        };

        setGamePhase("finished");
        onGameEnd(finalStats);
    }, [onGameEnd, speak]);

    const handleBlinkEvent = useCallback(
        (data) => {
            const newTotalBlinks = data.total;
            setBlinkCount(newTotalBlinks);
            statsRef.current.totalBlinks = newTotalBlinks;
            setStats((prev) => ({ ...prev, totalBlinks: newTotalBlinks }));

            if (gameState.current.phase === "intro" && newTotalBlinks >= 2) {
                startBaseline();
                return;
            }
        },
        [startBaseline]
    );

    const handleLeftBlink = useCallback((data) => {
        if (gameState.current.phase === "countdown") {
            statsRef.current.totalBlinks += 1;
            statsRef.current.leftBlinks += 1;
            setStats({ ...statsRef.current });
        }
    }, []);

    const handleRightBlink = useCallback((data) => {
        if (gameState.current.phase === "countdown") {
            statsRef.current.totalBlinks += 1;
            statsRef.current.rightBlinks += 1;
            setStats({ ...statsRef.current });
        }
    }, []);

    useEffect(() => {
        socket.current = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
        });

        socket.current.on("blink_event", handleBlinkEvent);
        socket.current.on("left_blink_event", handleLeftBlink);
        socket.current.on("right_blink_event", handleRightBlink);

        speak("眨双眼两次开始休息。");

        return () => {
            socket.current.disconnect();
            window.speechSynthesis.cancel();
        };
    }, [handleBlinkEvent, handleLeftBlink, handleRightBlink, speak]);

    useEffect(() => {
        if (shouldEnd && gameState.current.phase !== "finished") {
            endBaseline();
        }
    }, [shouldEnd, endBaseline]);

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
            {gamePhase === "intro" && (
                <div
                    style={{
                        padding: "20px",
                        borderRadius: "15px",
                        maxWidth: "80%",
                        margin: "20px",
                    }}>
                    <h1 style={{ marginBottom: "-0.5rem" }}>基线模式</h1>
                    <p style={{ lineHeight: "1.6", marginBottom: "1rem" }}>
                        接下来在倒计时的时间内。让眼睛好好休息一下吧
                        <br />
                        移开对于屏幕的注视，为眼部健康充能
                    </p>
                    <p
                        style={{
                            marginTop: "2rem",
                            fontSize: "1rem",
                            color: "pink",
                            fontWeight: "bold",
                        }}>
                        开始基线模式（眨双眼两次）
                        <br />
                        <span style={{ color: "pink" }}>{blinkCount}/2</span>
                    </p>
                </div>
            )}

            {gamePhase === "countdown" && (
                <div
                    style={{
                        padding: "20px",
                        borderRadius: "15px",
                        maxWidth: "80%",
                        margin: "20px",
                    }}>
                    <h1
                        style={{
                            fontSize: "3rem",
                            marginBottom: "1rem",
                        }}>
                        {remainingTime}秒
                    </h1>
                    <p>
                        接下来在倒计时的时间内。让眼睛好好休息一下吧
                        <br />
                        移开对于屏幕的注视，为眼部健康充能
                    </p>
                </div>
            )}

            {gamePhase === "finished" && (
                <div
                    style={{
                        padding: "20px",
                        borderRadius: "15px",
                        maxWidth: "80%",
                    }}>
                    <h2 style={{ color: "#4caf50" }}>基线模式完成！</h2>
                    <p>放松时间结束</p>
                    <p>正在生成结算信息...</p>
                </div>
            )}
        </div>
    );
};

export default BaselineMode;
