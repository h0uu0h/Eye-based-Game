/* eslint-disable react/prop-types */
import { useEffect, useState, useRef } from "react";

// 假设有100张图片，这里用占位符表示
const TOTAL_IMAGES = 100;
const PHASE1_IMAGES = 60;
const PHASE2_IMAGES = 20;

// 生成图片路径数组 (实际使用时替换为真实图片路径)
const generateImagePaths = () => {
    const images = [];
    for (let i = 1; i <= TOTAL_IMAGES; i++) {
        images.push(`/experiment-images/image${i}.jpg`);
    }
    return images;
};

const Experiment1Mode = ({ onGameEnd, shouldEnd }) => {
    const [phase, setPhase] = useState(1); // 1 或 2
    const [timeLeft, setTimeLeft] = useState(60);
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const timerRef = useRef(null);
    const allImages = useRef(generateImagePaths());
    const shownInPhase1 = useRef([]);

    // 初始化游戏
    useEffect(() => {
        // 随机选择60张图片用于阶段1
        const shuffled = [...allImages.current].sort(() => Math.random() - 0.5);
        shownInPhase1.current = shuffled.slice(0, PHASE1_IMAGES);
        setImages(shownInPhase1.current);

        // 开始倒计时
        startTimer(60);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // 监听游戏结束信号
    useEffect(() => {
        if (shouldEnd) {
            endGame();
        }
    }, [shouldEnd]);

    // 开始倒计时
    const startTimer = (seconds) => {
        setTimeLeft(seconds);
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    if (phase === 1) {
                        startPhase2();
                    } else {
                        endGame();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // 开始阶段2
    const startPhase2 = () => {
        // 从阶段1的图片中随机选择2-10张
        const numFromPhase1 = Math.floor(Math.random() * 9) + 2;
        const selectedFromPhase1 = [...shownInPhase1.current]
            .sort(() => Math.random() - 0.5)
            .slice(0, numFromPhase1);

        // 从未在阶段1展示的图片中随机选择剩余图片
        const remainingImages = allImages.current.filter(
            (img) => !shownInPhase1.current.includes(img)
        );
        const selectedFromNew = [...remainingImages]
            .sort(() => Math.random() - 0.5)
            .slice(0, PHASE2_IMAGES - numFromPhase1);

        // 合并两组图片并打乱顺序
        const phase2Images = [...selectedFromPhase1, ...selectedFromNew].sort(
            () => Math.random() - 0.5
        );

        setImages(phase2Images);
        setSelectedImages([]);
        setPhase(2);
        startTimer(30);
    };

    // 处理图片选择
    const handleImageClick = (index) => {
        if (phase !== 2) return;

        setSelectedImages((prev) => {
            if (prev.includes(index)) {
                return prev.filter((i) => i !== index);
            } else {
                return [...prev, index];
            }
        });
    };

    // 处理确认按钮
    const handleConfirm = () => {
        endGame();
    };

    // 结束游戏
    const endGame = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        // 传递空数据表示不需要结算
        onGameEnd(null);
    };

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
            }}>
            {/* 倒计时显示 */}
            <div
                style={{
                    position: "absolute",
                    top: "20px",
                    fontSize: "24px",
                    color: "white",
                    fontWeight: "bold",
                }}>
                {timeLeft}秒
            </div>

            {/* 图片展示区域 */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: "10px",
                    width: "90%",
                    maxHeight: "80%",
                    overflowY: "auto",
                    padding: "20px",
                }}>
                {images.map((img, index) => (
                    <div
                        key={index}
                        style={{
                            position: "relative",
                            cursor: phase === 2 ? "pointer" : "default",
                            opacity: selectedImages.includes(index) ? 0.5 : 1,
                            transition: "opacity 0.3s",
                            border: selectedImages.includes(index)
                                ? "2px solid cyan"
                                : "none",
                        }}
                        onClick={() => handleImageClick(index)}>
                        <img
                            src={img}
                            alt={`实验图片 ${index + 1}`}
                            style={{
                                width: "100%",
                                height: "auto",
                                borderRadius: "5px",
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* 阶段2的确认按钮 */}
            {phase === 2 && (
                <button
                    onClick={handleConfirm}
                    style={{
                        marginTop: "20px",
                        padding: "10px 30px",
                        fontSize: "18px",
                        backgroundColor: "#4CAF50",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                    }}>
                    确认
                </button>
            )}
        </div>
    );
};

export default Experiment1Mode;
