/* eslint-disable react/prop-types */
import { useEffect, useState, useRef } from "react";
import styles from "./MemoryTask.module.css";

const TOTAL_IMAGES = 100;
const PHASE1_IMAGES = 60;
const PHASE2_IMAGES = 20;

const generateImagePaths = () => {
    const images = [];
    for (let i = 1; i <= TOTAL_IMAGES; i++) {
        images.push(`/Eye-based-Game/100/${i}.jpg`);
    }
    return images;
};

const MemoryTask = ({ onComplete, gameId }) => {
    const [phase, setPhase] = useState(1);
    const [timeLeft, setTimeLeft] = useState(60);
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const timerRef = useRef(null);
    const allImages = useRef(generateImagePaths());
    const shownInPhase1 = useRef([]);

    // 游戏ID
    const taskIdRef = useRef(gameId);

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
                        endTask();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // 开始阶段2
    const startPhase2 = () => {
        const numFromPhase1 = Math.floor(Math.random() * 9) + 2;
        const selectedFromPhase1 = [...shownInPhase1.current]
            .sort(() => Math.random() - 0.5)
            .slice(0, numFromPhase1);

        const remainingImages = allImages.current.filter(
            (img) => !shownInPhase1.current.includes(img)
        );
        const selectedFromNew = [...remainingImages]
            .sort(() => Math.random() - 0.5)
            .slice(0, PHASE2_IMAGES - numFromPhase1);

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
        endTask();
    };

    // 结束任务
    const endTask = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        onComplete(taskIdRef.current);
    };

    return (
        <div className={styles.container}>
            <div
                className={`${styles.imageGrid} ${
                    phase === 1 ? styles.phase1Grid : styles.phase2Grid
                }`}>
                {images.map((img, index) => (
                    <div
                        key={index}
                        className={`${styles.imageContainer} ${
                            selectedImages.includes(index)
                                ? styles.selected
                                : ""
                        }`}
                        onClick={() => handleImageClick(index)}>
                        <img
                            src={img}
                            alt={`实验图片 ${index + 1}`}
                            className={styles.image}
                        />
                    </div>
                ))}
            </div>
            <div className={styles.instructions}>
                {phase === 1 ? (
                    <p>请仔细观看以下图片，您有60秒时间</p>
                ) : (
                    <p>请选择您在第一阶段见过的图片（点击选择）</p>
                )}
            </div>
            <div className={styles.timer}>{timeLeft}秒</div>

            {phase === 2 && (
                <button
                    onClick={handleConfirm}
                    className={styles.confirmButton}>
                    确认选择
                </button>
            )}

            <div className={styles.gameId}>任务ID: {taskIdRef.current}</div>
        </div>
    );
};

export default MemoryTask;
