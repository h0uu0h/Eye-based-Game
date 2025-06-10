/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import doubleBlink from "/sounds/blink.wav";
import doubleClosed from "/sounds/blink.wav";
import leftBlink from "/sounds/start.wav";
import leftClosed from "/sounds/start.wav";
import rightBlink from "/sounds/miss.wav";
import rightClosed from "/sounds/miss.wav";

// 演奏模式组件
const PlayMode = () => {
    const [message, setMessage] = useState("");
    const [messageColor, setMessageColor] = useState("white");
    const [volume, setVolume] = useState(0.7); // 音量控制 (0-1)
    const [frequency, setFrequency] = useState(500); // 闭眼音频播放频率 (ms)

    // 眼睛状态
    const [leftEyeState, setLeftEyeState] = useState("open");
    const [rightEyeState, setRightEyeState] = useState("open");
    const [overallState, setOverallState] = useState("open");

    // 音频引用
    const doubleBlinkAudioRef = useRef(null);
    const doubleClosedAudioRef = useRef(null);
    const leftBlinkAudioRef = useRef(null);
    const leftClosedAudioRef = useRef(null);
    const rightBlinkAudioRef = useRef(null);
    const rightClosedAudioRef = useRef(null);

    // 定时器引用
    const leftClosedTimerRef = useRef(null);
    const rightClosedTimerRef = useRef(null);
    const doubleClosedTimerRef = useRef(null);

    // 状态统计
    const [stats, setStats] = useState({
        doubleBlinks: 0,
        doubleCloses: 0,
        leftBlinks: 0,
        leftCloses: 0,
        rightBlinks: 0,
        rightCloses: 0,
    });

    // 设置音频音量
    useEffect(() => {
        const audios = [
            doubleBlinkAudioRef.current,
            doubleClosedAudioRef.current,
            leftBlinkAudioRef.current,
            leftClosedAudioRef.current,
            rightBlinkAudioRef.current,
            rightClosedAudioRef.current,
        ];

        audios.forEach((audio) => {
            if (audio) audio.volume = volume;
        });
    }, [volume]);

    // 处理眼睛状态变化
    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
            reconnectionAttempts: 3,
            autoConnect: true,
        });

        // 整体眼睛状态
        socket.on("eye_state", ({ status }) => {
            setOverallState(status);
        });

        // 左眼状态
        socket.on("left_eye_state", ({ status }) => {
            setLeftEyeState(status);
        });

        // 右眼状态
        socket.on("right_eye_state", ({ status }) => {
            setRightEyeState(status);
        });

        // 整体眨眼事件
        // socket.on("blink_event", () => {
        //     playDoubleBlink();
        // });

        // 左眼眨眼事件
        socket.on("left_blink_event", () => {
            playLeftBlink();
        });

        // 右眼眨眼事件
        socket.on("right_blink_event", () => {
            playRightBlink();
        });

        return () => {
            socket.disconnect();
            clearAllTimers();
        };
    }, []);

    // 处理闭眼状态
    useEffect(() => {
        // 清除所有定时器
        clearAllTimers();

        // 处理双眼闭状态
        if (overallState === "closed") {
            // playDoubleClosed();
            // doubleClosedTimerRef.current = setInterval(
            //     playDoubleClosed,
            //     frequency
            // );
            // setMessage("双眼闭");
            // setMessageColor("cyan");
            // setStats((prev) => ({
            //     ...prev,
            //     doubleCloses: prev.doubleCloses + 1,
            // }));
        }
        // 处理左眼闭状态
        else if (leftEyeState === "closed") {
            playLeftClosed();
            leftClosedTimerRef.current = setInterval(playLeftClosed, frequency);
            setMessage("左眼闭");
            setMessageColor("lime");
            setStats((prev) => ({ ...prev, leftCloses: prev.leftCloses + 1 }));
        }
        // 处理右眼闭状态
        else if (rightEyeState === "closed") {
            playRightClosed();
            rightClosedTimerRef.current = setInterval(
                playRightClosed,
                frequency
            );
            setMessage("右眼闭");
            setMessageColor("orange");
            setStats((prev) => ({
                ...prev,
                rightCloses: prev.rightCloses + 1,
            }));
        }
        // 所有眼睛都睁开
        else {
            setMessage("");
        }

        return clearAllTimers;
    }, [overallState, leftEyeState, rightEyeState, frequency]);

    // 清除所有定时器
    const clearAllTimers = () => {
        if (leftClosedTimerRef.current)
            clearInterval(leftClosedTimerRef.current);
        if (rightClosedTimerRef.current)
            clearInterval(rightClosedTimerRef.current);
        if (doubleClosedTimerRef.current)
            clearInterval(doubleClosedTimerRef.current);
        leftClosedTimerRef.current = null;
        rightClosedTimerRef.current = null;
        doubleClosedTimerRef.current = null;
    };

    // 播放各种声音的函数
    // const playDoubleBlink = () => {
    //     if (doubleBlinkAudioRef.current) {
    //         doubleBlinkAudioRef.current.currentTime = 0;
    //         doubleBlinkAudioRef.current.play();
    //         setMessage("双眼眨");
    //         setMessageColor("yellow");
    //         setTimeout(() => {
    //             if (
    //                 overallState === "open" &&
    //                 leftEyeState === "open" &&
    //                 rightEyeState === "open"
    //             ) {
    //                 setMessage("");
    //             }
    //         }, 500);
    //         setStats((prev) => ({
    //             ...prev,
    //             doubleBlinks: prev.doubleBlinks + 1,
    //         }));
    //     }
    // };

    // const playDoubleClosed = () => {
    //     if (doubleClosedAudioRef.current) {
    //         doubleClosedAudioRef.current.currentTime = 0;
    //         doubleClosedAudioRef.current.play();
    //     }
    // };

    const playLeftBlink = () => {
        if (leftBlinkAudioRef.current) {
            leftBlinkAudioRef.current.currentTime = 0;
            leftBlinkAudioRef.current.play();
            setMessage("左眼眨");
            setMessageColor("lime");
            setTimeout(() => {
                if (leftEyeState === "open") setMessage("");
            }, 500);
            setStats((prev) => ({ ...prev, leftBlinks: prev.leftBlinks + 1 }));
        }
    };

    const playLeftClosed = () => {
        if (leftClosedAudioRef.current) {
            leftClosedAudioRef.current.currentTime = 0;
            leftClosedAudioRef.current.play();
        }
    };

    const playRightBlink = () => {
        if (rightBlinkAudioRef.current) {
            rightBlinkAudioRef.current.currentTime = 0;
            rightBlinkAudioRef.current.play();
            setMessage("右眼眨");
            setMessageColor("orange");
            setTimeout(() => {
                if (rightEyeState === "open") setMessage("");
            }, 500);
            setStats((prev) => ({
                ...prev,
                rightBlinks: prev.rightBlinks + 1,
            }));
        }
    };

    const playRightClosed = () => {
        if (rightClosedAudioRef.current) {
            rightClosedAudioRef.current.currentTime = 0;
            rightClosedAudioRef.current.play();
        }
    };

    // 渲染UI
    return (
        <>
            {/* 状态显示 */}
            <div
                style={{
                    position: "absolute",
                    top: "20%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: messageColor,
                    fontSize: "32px",
                    fontWeight: "bold",
                    zIndex: 20,
                    textShadow: "0 0 5px black",
                    transition: "opacity 0.3s",
                    pointerEvents: "none",
                    textAlign: "center",
                    width: "100%",
                }}>
                {message}
            </div>

            {/* 控制面板 */}
            <div
                style={{
                    position: "absolute",
                    bottom: "20px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    backgroundColor: "rgba(0,0,0,0.7)",
                    padding: "15px",
                    borderRadius: "10px",
                    zIndex: 10,
                }}>
                <div>
                    <label style={{ color: "white", marginRight: "10px" }}>
                        音量: {Math.round(volume * 100)}%
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        style={{ width: "150px" }}
                    />
                </div>

                <div>
                    <label style={{ color: "white", marginRight: "10px" }}>
                        闭眼频率: {frequency}ms
                    </label>
                    <input
                        type="range"
                        min="200"
                        max="2000"
                        step="100"
                        value={frequency}
                        onChange={(e) => setFrequency(parseInt(e.target.value))}
                        style={{ width: "150px" }}
                    />
                </div>
            </div>

            {/* 状态统计 */}
            <div
                style={{
                    position: "absolute",
                    top: "20px",
                    right: "20px",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "10px",
                    backgroundColor: "rgba(0,0,0,0.7)",
                    padding: "15px",
                    borderRadius: "10px",
                    zIndex: 10,
                }}>
                <div style={{ color: "cyan" }}>
                    双眼眨: {stats.doubleBlinks}
                </div>
                <div style={{ color: "cyan" }}>
                    双眼闭: {stats.doubleCloses}
                </div>
                <div style={{ color: "lime" }}>左眼眨: {stats.leftBlinks}</div>
                <div style={{ color: "lime" }}>左眼闭: {stats.leftCloses}</div>
                <div style={{ color: "orange" }}>
                    右眼眨: {stats.rightBlinks}
                </div>
                <div style={{ color: "orange" }}>
                    右眼闭: {stats.rightCloses}
                </div>
            </div>

            {/* 音频元素 */}
            <audio ref={doubleBlinkAudioRef} src={doubleBlink} preload="auto" />
            <audio
                ref={doubleClosedAudioRef}
                src={doubleClosed}
                preload="auto"
            />
            <audio ref={leftBlinkAudioRef} src={leftBlink} preload="auto" />
            <audio ref={leftClosedAudioRef} src={leftClosed} preload="auto" />
            <audio ref={rightBlinkAudioRef} src={rightBlink} preload="auto" />
            <audio ref={rightClosedAudioRef} src={rightClosed} preload="auto" />
        </>
    );
};

export default PlayMode;
