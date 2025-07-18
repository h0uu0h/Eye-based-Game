import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import BlinkMarker from "../BlinkMarker";

// 导入音频文件
import fbBlink from "/sounds/fb_blink.mp3";
import fbClose from "/sounds/fb_close.mp3";
import fbOpen from "/sounds/fb_open.mp3";
import fbLeftBlink from "/sounds/fb_leftblink.mp3";
import fbLeftClose from "/sounds/fb_leftclose.mp3";
import fbLeftOpen from "/sounds/fb_leftopen.mp3";
import fbRightBlink from "/sounds/fb_rightblink.mp3";
import fbRightClose from "/sounds/fb_rightclose.mp3";
import fbRightOpen from "/sounds/fb_rightopen.mp3";

const VoiceFeedbackMode = () => {
    // 创建音频引用
    const audioRefs = useRef({
        blink: new Audio(fbBlink),
        close: new Audio(fbClose),
        open: new Audio(fbOpen),
        leftBlink: new Audio(fbLeftBlink),
        leftClose: new Audio(fbLeftClose),
        leftOpen: new Audio(fbLeftOpen),
        rightBlink: new Audio(fbRightBlink),
        rightClose: new Audio(fbRightClose),
        rightOpen: new Audio(fbRightOpen),
    });

    // 状态帧计数器
    const stateCounters = useRef({
        overall: { open: 0, closed: 0 },
        left: { open: 0, closed: 0 },
        right: { open: 0, closed: 0 },
    });

    // 当前状态
    const currentState = useRef({
        overall: "open",
        left: "open",
        right: "open",
    });

    // 已确认状态
    const confirmedState = useRef({
        overall: "open",
        left: "open",
        right: "open",
    });

    // 帧率 (约30fps)
    const frameRate = 1000 / 30; // 约33ms每帧

    // 播放音频
    const playAudio = (type) => {
        const audio = audioRefs.current[type];
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch((e) => console.log("Audio play failed:", e));
        }
    };

    // 处理状态变化 (基于帧计数)
    const handleStateChange = (type, newStatus) => {
        // 更新当前状态
        currentState.current[type] = newStatus;

        // 重置相反状态的计数器
        const oppositeStatus = newStatus === "open" ? "closed" : "open";
        stateCounters.current[type][oppositeStatus] = 0;

        // 增加当前状态的计数器
        stateCounters.current[type][newStatus] += 1;

        // 计算需要的帧数 (200ms / 帧间隔)
        // const requiredFrames = Math.ceil(200 / frameRate);
        const requiredFrames = 15;

        // 检查是否达到所需的帧数
        if (stateCounters.current[type][newStatus] >= requiredFrames) {
            // 如果状态已经确认过，则不重复触发
            if (confirmedState.current[type] !== newStatus) {
                // 更新已确认状态
                confirmedState.current[type] = newStatus;

                // 根据类型和状态播放对应的音频
                if (type === "overall") {
                    if (newStatus === "closed") {
                        playAudio("close");
                    } else if (newStatus === "open") {
                        playAudio("open");
                    }
                } else if (type === "left") {
                    if (newStatus === "closed") {
                        playAudio("leftClose");
                    } else if (newStatus === "open") {
                        playAudio("leftOpen");
                    }
                } else if (type === "right") {
                    if (newStatus === "closed") {
                        playAudio("rightClose");
                    } else if (newStatus === "open") {
                        playAudio("rightOpen");
                    }
                }
            }
        }
    };

    // 设置定时器处理状态更新
    useEffect(() => {
        const interval = setInterval(() => {
            // 检查整体眼睛状态
            if (currentState.current.overall) {
                handleStateChange("overall", currentState.current.overall);
            }

            // 检查左眼状态
            if (currentState.current.left) {
                handleStateChange("left", currentState.current.left);
            }

            // 检查右眼状态
            if (currentState.current.right) {
                handleStateChange("right", currentState.current.right);
            }
        }, frameRate);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        // 监听整体眼睛状态
        socket.on("eye_state", ({ status }) => {
            currentState.current.overall = status;
        });

        // 监听左眼状态
        socket.on("left_eye_state", ({ status }) => {
            currentState.current.left = status;
        });

        // 监听右眼状态
        socket.on("right_eye_state", ({ status }) => {
            currentState.current.right = status;
        });

        // 监听眨眼事件
        socket.on("blink_event", () => {
            playAudio("blink");
        });

        socket.on("left_blink_event", () => {
            playAudio("leftBlink");
        });

        socket.on("right_blink_event", () => {
            playAudio("rightBlink");
        });

        return () => {
            socket.disconnect();
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
                pointerEvents: "none",
                zIndex: 15,
            }}>
            <BlinkMarker />
        </div>
    );
};

export default VoiceFeedbackMode;
