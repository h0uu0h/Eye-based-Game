/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import { useEffect, useState, useRef } from "react";
import styles from "./MemoryTask.module.css";
import BlinkDetector from "./BlinkDetector";

const TOTAL_IMAGES = 100;
// const PHASE1_IMAGES = 60;
// const PHASE2_IMAGES = 20;
// const PHASE1_TIME = 60;
// const PHASE2_TIME = 30;

const generateImagePaths = () => {
    const images = [];
    for (let i = 1; i <= TOTAL_IMAGES; i++) {
        images.push(`/Eye-based-Game/100/${i}.jpg`);
    }
    return images;
};

const MemoryTask = ({ onComplete, gameId, config }) => {
    const {
        phase1Images = 60,
        phase2Images = 20,
        phase1Time = 60,
        phase2Time = 20,
    } = config;
    // const phaseRef = useRef(1);
    const [phase, setPhase] = useState(1);
    const [timeLeft, setTimeLeft] = useState(60);
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const timerRef = useRef(null);
    const allImages = useRef(generateImagePaths());
    const shownInPhase1 = useRef([]);
    const taskIdRef = useRef(gameId);

    // 管理眨眼数据
    const blinkDataRef = useRef([]);
    const hasEndedRef = useRef(false);
    const [detectionActive, setDetectionActive] = useState(false);
    const [shouldEnd, setShouldEnd] = useState(false);

    useEffect(() => {
        // 随机选择60张图片用于阶段1
        const shuffled = [...allImages.current].sort(() => Math.random() - 0.5);
        shownInPhase1.current = shuffled.slice(0, phase1Images);
        setImages(shownInPhase1.current);

        // 开始倒计时
        startTimer(phase1Time);

        const detectionTimer = setTimeout(() => {
            setDetectionActive(true);
        }, 100);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);
    useEffect(() => {
        if (phase === 1) {
            startTimer(phase1Time);
        } else if (phase === 2) {
            startTimer(phase2Time);
        }
    }, [phase]);

    const handlePhaseEnd = () => {
        if (phase === 1) {
            startPhase2();
        } else if (phase === 2) {
            endTask();
        }
    };

    // 开始倒计时
    const startTimer = (seconds) => {
        setTimeLeft(seconds);
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    // 不再做逻辑跳转
                    handlePhaseEnd();
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
            .slice(0, phase2Images - numFromPhase1);

        const phase2ImagesLi = [...selectedFromPhase1, ...selectedFromNew].sort(
            () => Math.random() - 0.5
        );

        setImages(phase2ImagesLi);
        setSelectedImages([]);
        setPhase(2);
        // phaseRef.current = 2;
        startTimer(phase2Time);
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
    // const handleConfirm = () => {
    //     endTask();
    // };

    // 结束任务
    const endTask = () => {
        if (hasEndedRef.current) return; // 避免多次调用
        hasEndedRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
        // 1. 结束眨眼检测
        setShouldEnd(true);

        // 2. 延迟调用 onComplete 以确保眨眼数据已s收集
        const completeTimer = setTimeout(() => {
            console.log("blinkdataRef", blinkDataRef.current);

            onComplete(gameId, blinkDataRef.current);

            // 重置检测状态
            setDetectionActive(false);
            setShouldEnd(false);
            blinkDataRef.current = [];
        }, 500);

        return () => clearTimeout(completeTimer);
    };
    const handleBlinkData = (data) => {
        console.log("taskdata", data);
        blinkDataRef.current = data;
    };
    return (
        <div className={styles.container}>
            {detectionActive && (
                <BlinkDetector onData={handleBlinkData} shouldEnd={shouldEnd} />
            )}
            <h2 style={{ margin: 0 }}>Picture Memory</h2>
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
                    <p>Please observe and memorize the following pictures</p>
                ) : (
                    <p>
                        Please click to select the picture you have just seen.
                    </p>
                )}
            </div>
            <div className={styles.timer}>{timeLeft}s</div>

            {/* {phase === 2 && (
                <button
                    onClick={handleConfirm}
                    className={styles.confirmButton}>
                    确认选择
                </button>
            )} */}

            <div className={styles.gameId}>Task ID: {taskIdRef.current}</div>
        </div>
    );
};

export default MemoryTask;
