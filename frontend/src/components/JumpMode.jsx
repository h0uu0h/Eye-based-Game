/* eslint-disable react/prop-types */
import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import ProgressCircle from "./ProgressCircle";
import powerSound from "/sounds/jump/power.mp3";
import jumpSound from "/sounds/jump/jump.mp3";
import successSound from "/sounds/jump/success.mp3";
import failSound from "/sounds/jump/fail.mp3";
import backgroundSound from "/sounds/jump/background.mp3";

const JumpMode = ({ onGameEnd }) => {
    const gameStatsRef = useRef({
        totalJumps: 0,
        successfulJumps: 0,
        totalHeight: 0,
    });

    // UI状态（仅用于渲染）
    const [uiState, setUiState] = useState({
        gameState: "waiting", // waiting, playing, ended
        countdown: 60, // 秒
        cloudHeight: 0, // 当前云朵高度
        power: 0, // 蓄力值(0-1)
        jumpResults: [], // 跳跃结果历史
        blinkCount: 0, // 眨眼次数
        difficulty: "easy",
    });

    // 其他refs
    const cloudHeightRef = useRef(0);
    const powerSoundIntervalRef = useRef(null);
    const socket = useRef(null);
    const blinkCountRef = useRef(0);
    const countdownTimerRef = useRef(null);
    const powerTimerRef = useRef(null);
    const powerStartTimeRef = useRef(0);
    const difficultyRef = useRef("easy");

    // 音效
    const powerAudioRef = useRef(null);
    const jumpAudioRef = useRef(null);
    const successAudioRef = useRef(null);
    const failAudioRef = useRef(null);
    const backgroundAudioRef = useRef(null);
    // 使用浏览器语音播报
    const speak = (text) => {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN"; // 中文
        utterance.rate = 1; // 语速
        window.speechSynthesis.speak(utterance);
    };

    // 生成新云朵高度
    const generateCloud = useCallback(() => {
        const difficulty = difficultyRef.current || "easy";
        let min = 1.0;
        let max = 3.0;

        if (difficulty === "hard") {
            min = 3.0;
            max = 6.0;
        }

        const height = parseFloat(
            (Math.random() * (max - min) + min).toFixed(1)
        );
        cloudHeightRef.current = height;
        setUiState((prev) => ({ ...prev, cloudHeight: height }));
        speak(`距离上方云朵的高度是 ${height} 米`);
        return height;
    }, []);

    // 初始化socket连接
    useEffect(() => {
        socket.current = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
        });

        // 监听眨眼事件
        socket.current.on("blink_event", () => {
            if (uiState.gameState === "waiting") {
                blinkCountRef.current++;
                setUiState((prev) => ({
                    ...prev,
                    blinkCount: blinkCountRef.current,
                }));

                // 眨眼两次开始游戏
                if (blinkCountRef.current >= 2) {
                    startGame();
                }
            }
        });

        // 监听眼睛状态
        socket.current.on("eye_state", (data) => {
            if (uiState.gameState === "playing") {
                if (data.status === "closed") {
                    startPower();
                } else if (data.status === "open") {
                    endPower();
                }
            }
        });

        return () => {
            socket.current.disconnect();
        };
    }, [uiState.gameState]);

    // 开始游戏
    const startGame = () => {
        // 重置所有数据
        gameStatsRef.current = {
            totalJumps: 0,
            successfulJumps: 0,
            totalHeight: 0,
        };

        setUiState({
            gameState: "playing",
            countdown: 60,
            cloudHeight: 0,
            power: 0,
            jumpResults: [],
            blinkCount: 0,
        });

        blinkCountRef.current = 0;

        // 播放背景音乐
        backgroundAudioRef.current.loop = true;
        backgroundAudioRef.current.volume = 0.5;
        backgroundAudioRef.current.play().catch((e) => {
            console.warn("背景音乐播放失败：", e);
        });

        // 生成第一个云朵高度
        generateCloud();

        // 开始倒计时
        countdownTimerRef.current = setInterval(() => {
            setUiState((prev) => {
                if (prev.countdown <= 1) {
                    endGame();
                    return { ...prev, countdown: 0 };
                }
                return { ...prev, countdown: prev.countdown - 1 };
            });
        }, 1000);
    };

    // 循环播放蓄力音效
    const playPowerSoundLoop = () => {
        if (powerSoundIntervalRef.current) return;

        const loop = () => {
            const duration = (Date.now() - powerStartTimeRef.current) / 1000;
            const normalized = Math.min(duration, 5) / 5;
            const interval = 500 - normalized * 400;

            powerAudioRef.current.currentTime = 0;
            powerAudioRef.current.play().catch(() => {});

            powerSoundIntervalRef.current = setTimeout(loop, interval);
        };

        loop();
    };

    // 开始蓄力
    const startPower = () => {
        powerStartTimeRef.current = Date.now();
        setUiState((prev) => ({ ...prev, power: 0 }));

        // 每50ms更新蓄力值
        powerTimerRef.current = setInterval(() => {
            const duration = (Date.now() - powerStartTimeRef.current) / 1000;
            setUiState((prev) => ({
                ...prev,
                power: Math.min(duration, 5) / 5,
            }));
        }, 50);

        playPowerSoundLoop();
    };

    // 结束蓄力
    const endPower = () => {
        if (!powerTimerRef.current) return;

        clearInterval(powerTimerRef.current);
        powerTimerRef.current = null;

        if (powerSoundIntervalRef.current) {
            clearTimeout(powerSoundIntervalRef.current);
            powerSoundIntervalRef.current = null;
        }

        const duration = (Date.now() - powerStartTimeRef.current) / 1000;
        if (duration > 0.3) {
            const jumpPower = Math.min(duration, 5); // 最大5米
            jumpAudioRef.current.play();
            attemptJump(jumpPower);
        }
    };

    // 尝试跳跃
    const attemptJump = (jumpPower) => {
        // 更新实时数据
        gameStatsRef.current.totalJumps += 1;

        const currentHeight = cloudHeightRef.current;
        const diff = Math.abs(jumpPower - currentHeight);
        const isSuccess = diff <= 1; // 误差在1米内成功

        // 更新结果
        const newResult = {
            power: jumpPower.toFixed(1),
            height: currentHeight,
            success: isSuccess,
        };

        if (isSuccess) {
            speak(`跳跃 ${jumpPower.toFixed(1)} 米，成功！`);
            successAudioRef.current.play();
            gameStatsRef.current.successfulJumps += 1;
            gameStatsRef.current.totalHeight += currentHeight;
            generateCloud(); // 生成新云朵
        } else if (jumpPower > 0.3) {
            speak(`跳跃 ${jumpPower.toFixed(1)} 米，未能成功`);
            failAudioRef.current.play();
        }

        // 更新UI状态
        setUiState((prev) => ({
            ...prev,
            jumpResults: [...prev.jumpResults, newResult],
            power: 0,
        }));
    };

    // 结束游戏
    const endGame = useCallback(() => {
        // 清理定时器
        clearInterval(countdownTimerRef.current);
        clearInterval(powerTimerRef.current);
        if (powerSoundIntervalRef.current) {
            clearTimeout(powerSoundIntervalRef.current);
        }

        // 停止背景音乐
        backgroundAudioRef.current.pause();
        backgroundAudioRef.current.currentTime = 0;

        // 更新UI状态
        setUiState((prev) => ({ ...prev, gameState: "ended" }));

        // 准备结算数据
        setTimeout(() => {
            const finalStats = gameStatsRef.current;
            const achievement = finalStats.totalHeight > 30 ? "踩云朵达人" : "";

            // 保存到localStorage
            const history = JSON.parse(
                localStorage.getItem("blinkGameHistory") || "[]"
            );

            const gameData = {
                mode: "jump",
                timestamp: Date.now(),
                ...finalStats,
                achievement,
            };

            history.push(gameData);
            localStorage.setItem("blinkGameHistory", JSON.stringify(history));

            // 计算排名
            const jumpGames = history
                .filter((g) => g.mode === "jump")
                .sort((a, b) => b.totalHeight - a.totalHeight);

            const rank =
                jumpGames.findIndex((g) => g.timestamp === gameData.timestamp) +
                1;

            // 触发结算
            onGameEnd({
                ...gameData,
                rank,
                totalGames: jumpGames.length,
            });
        }, 1500);
    }, [onGameEnd]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            [
                powerAudioRef,
                jumpAudioRef,
                successAudioRef,
                failAudioRef,
                backgroundAudioRef,
            ].forEach((ref) => {
                if (ref.current) {
                    ref.current.pause();
                    ref.current.currentTime = 0;
                }
            });
        };
    }, []);

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
            {/* 音效资源 */}
            <audio ref={powerAudioRef} src={powerSound} preload="auto" />
            <audio ref={jumpAudioRef} src={jumpSound} preload="auto" />
            <audio ref={successAudioRef} src={successSound} preload="auto" />
            <audio ref={failAudioRef} src={failSound} preload="auto" />
            <audio
                ref={backgroundAudioRef}
                src={backgroundSound}
                preload="auto"
            />

            {uiState.gameState === "waiting" && (
                <div>
                    <h1 style={{ marginBottom: "-0.5rem" }}>踩云朵冒险</h1>
                    <p
                        style={{
                            color: "rgb(255,255,255,0.7)",
                        }}>
                        根据语音提示跳跃到指定的云朵高度
                    </p>
                    <select
                        value={uiState.difficulty}
                        onChange={(e) => {
                            const value = e.target.value;
                            difficultyRef.current = value;
                            setUiState((prev) => ({
                                ...prev,
                                difficulty: value,
                            }));
                        }}>
                        <option value="easy">简单</option>
                        <option value="hard">困难</option>
                    </select>

                    <p>
                        闭眼 → 蓄力
                        <br />
                        （每蓄力1秒可以多跳跃1米）
                        <br />
                        睁眼 → 跳跃
                    </p>
                    <p
                        style={{
                            marginTop: "2rem",
                            fontSize: "1rem",
                            color: "pink",
                        }}>
                        开始游戏（眨双眼两次）
                        <span style={{ color: "pink" }}>
                            {uiState.blinkCount}/2
                        </span>
                    </p>
                </div>
            )}

            {uiState.gameState === "playing" && (
                <>
                    <h1>{uiState.countdown}秒</h1>
                    <p>
                        闭眼 → 蓄力
                        <br />
                        （每蓄力1秒可以多跳跃1米）
                        <br />
                        睁眼 → 跳跃
                    </p>

                    <div
                        style={{
                            position: "absolute",
                            right: "20px",
                            top: "20px",
                            marginBottom: "2rem",
                        }}>
                        <h2>
                            当前云朵高度: {uiState.cloudHeight.toFixed(1)}米
                        </h2>
                    </div>

                    {uiState.power > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                right: "20px",
                                top: "300px",
                                margin: "1rem 0",
                            }}>
                            <ProgressCircle
                                progress={uiState.power}
                                size={120}
                                strokeWidth={10}
                                color="#4CAF50"
                            />
                            <p>蓄力中: {(uiState.power * 5).toFixed(1)}秒</p>
                        </div>
                    )}

                    <div
                        style={{
                            position: "absolute",
                            right: "20px",
                            top: "50px",
                            marginTop: "2rem",
                            backgroundColor: "rgba(0,0,0,0.7)",
                            padding: "1rem",
                            borderRadius: "8px",
                            maxHeight: "200px",
                            overflowY: "auto",
                        }}>
                        <h3>跳跃记录</h3>
                        {uiState.jumpResults
                            .slice()
                            .reverse()
                            .map((result, index) => (
                                <p
                                    key={index}
                                    style={{
                                        color: result.success
                                            ? "lime"
                                            : "orange",
                                    }}>
                                    {result.power}米 →{" "}
                                    {result.height.toFixed(1)}米:
                                    {result.success ? "成功" : "失败"}
                                </p>
                            ))}
                    </div>
                </>
            )}

            {uiState.gameState === "ended" && (
                <div>
                    <h2>游戏结束!</h2>
                    <p>正在生成结算信息...</p>
                </div>
            )}
        </div>
    );
};

export default JumpMode;
