/* eslint-disable react/prop-types */
import { useEffect, useRef } from "react";

const ProgressCircle = ({
    progress,
    size = 100,
    strokeWidth = 10,
    color = "yellow",
}) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        const radius = size / 2 - strokeWidth / 2;
        const centerX = size / 2;
        const centerY = size / 2;
        const startAngle = -Math.PI / 2; // Starting at the top (12 o'clock)
        const endAngle = startAngle + 2 * Math.PI * progress;

        // Clear the canvas before drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background circle (gray)
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = "#444444"; // background color (light gray)
        ctx.stroke();

        // Draw progress circle (yellow)
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = color; // progress color (yellow)
        ctx.stroke();
    }, [progress, size, strokeWidth, color]);

    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            style={{
                display: "block",
                margin: "0 auto",
                borderRadius: "50%",
                backgroundColor: "transparent",
                zIndex: "100",
            }}
        />
    );
};

export default ProgressCircle;
