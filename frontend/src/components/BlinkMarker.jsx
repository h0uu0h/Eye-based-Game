import { useEffect, useRef } from "react";

import { gsap } from "gsap";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";
gsap.registerPlugin(Physics2DPlugin);

import { io } from "socket.io-client";
import markerUrl from "/icon/marker.svg";
const markerImg = new Image();
markerImg.src = markerUrl;

const BlinkMarker = () => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const markersRef = useRef([]);
    const eyePositionsRef = useRef({
        left: { x: 0.3, y: 0.5 },
        right: { x: 0.7, y: 0.5 },
    });

    const animate = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        markersRef.current.forEach((marker) => {
            ctx.save();
            ctx.globalAlpha = marker.alpha;
            ctx.drawImage(marker.img, marker.x - 12, marker.y - 12, 24, 24);
            ctx.restore();
        });

        animationRef.current = requestAnimationFrame(animate);
    };

    const addMarker = (type) => {
        const positions = eyePositionsRef.current;
        const types = type === "double" ? ["left", "right"] : [type];

        types.forEach((t) => {
            const canvas = canvasRef.current;
            const position = {
                x: positions[t].x * canvas.width,
                y: positions[t].y * canvas.height,
            };

            const marker = {
                x: position.x,
                y: position.y,
                alpha: 1,
                img: markerImg,
            };

            markersRef.current.push(marker);

            // 抛射角度控制
            const angle = t === "left" ? -gsap.utils.random(20, 50) : -gsap.utils.random(120 , 150); // 左眼左上抛，右眼右上抛
            const velocity = 300;
            const gravity = 600;

            // 位置物理动画
            gsap.to(marker, {
                physics2D: {
                    angle,
                    velocity,
                    gravity,
                },
                duration: 1.5,
                ease: "none",
            });

            // alpha 淡出（延时淡出）
            gsap.to(marker, {
                alpha: 0,
                duration: 0.2,
                delay: 0.3,
                scale: 0.8,
                rotation: gsap.utils.random(-20, 20), // 轻微旋转
                ease: "power1.in",
                onComplete: () => {
                    const idx = markersRef.current.indexOf(marker);
                    if (idx > -1) {
                        markersRef.current.splice(idx, 1);
                    }
                },
            });
        });
    };

    // 监听眼睛关键点
    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on("eye_landmarks", ({ left_eye, right_eye }) => {
            if (left_eye?.length) {
                // 计算左眼中心位置
                const leftCenter = left_eye.reduce(
                    (acc, point) => ({
                        x: acc.x + point[0],
                        y: acc.y + point[1],
                    }),
                    { x: 0, y: 0 }
                );
                eyePositionsRef.current.left = {
                    x: leftCenter.x / left_eye.length,
                    y: leftCenter.y / left_eye.length,
                };
            }

            if (right_eye?.length) {
                // 计算右眼中心位置
                const rightCenter = right_eye.reduce(
                    (acc, point) => ({
                        x: acc.x + point[0],
                        y: acc.y + point[1],
                    }),
                    { x: 0, y: 0 }
                );
                eyePositionsRef.current.right = {
                    x: rightCenter.x / right_eye.length,
                    y: rightCenter.y / right_eye.length,
                };
            }
        });

        // 监听眨眼事件
        socket.on("blink_event", () => {
            addMarker("double");
        });

        socket.on("left_blink_event", () => {
            addMarker("left");
        });

        socket.on("right_blink_event", () => {
            addMarker("right");
        });

        // 开始动画
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            socket.disconnect();
            cancelAnimationFrame(animationRef.current);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={640}
            height={480}
            style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scaleX(-1)",
                pointerEvents: "none",
                zIndex: 16, // 在眼睛关键点之上
            }}
        />
    );
};

export default BlinkMarker;
