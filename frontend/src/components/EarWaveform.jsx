import { useState, useEffect, useRef } from "react";
import { ResponsiveLine } from "@nivo/line";
import { io } from "socket.io-client";

const EarWaveform = () => {
    const [data, setData] = useState([
        { id: "EAR", color: "#cc66ff", data: [] },
    ]);
    const [threshold, setThreshold] = useState(null);

    const earRef = useRef([]);

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        setThreshold(localStorage.getItem("threshold") || 0);

        socket.on("ear_value", (valueData) => {
            const newValue = valueData.value;
            const timestamp = Date.now();

            if (typeof newValue === "number" && !isNaN(newValue)) {
                earRef.current.push({ x: timestamp, y: newValue });
                if (earRef.current.length > 100) earRef.current.shift();

                setData([
                    {
                        id: "EAR",
                        color: "#cc66ff",
                        data: [...earRef.current],
                    },
                ]);
            }
        });

        socket.on("calibrated", (data) => {
            setThreshold(data.threshold);
        });

        return () => socket.disconnect();
    }, []);

    return (
        <div
            style={{
                height: "200px",
                width: "100%",
                background: "#1a1a1a",
                borderRadius: "8px",
            }}>
            <ResponsiveLine
                theme={{
                    axis: {
                        ticks: {
                            text: { fill: "#ccc" },
                        },
                        legend: {
                            text: { fill: "#ccc" },
                        },
                    },
                    legends: {
                        text: { fill: "#ccc" },
                    },
                    tooltip: {
                        container: {
                            background: "#222",
                            color: "#fff",
                            fontSize: 12,
                        },
                    },
                }}
                data={data}
                margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                xScale={{ type: "linear", min: "auto", max: "auto" }}
                yScale={{ type: "linear", min: "auto", max: "auto" }}
                axisBottom={{
                    tickValues: 5,
                    format: (v) =>
                        new Date(v).toLocaleTimeString().split(" ")[0],
                    legend: "时间",
                    legendPosition: "middle",
                    legendOffset: 30,
                }}
                axisLeft={{
                    legend: "值",
                    legendPosition: "middle",
                    legendOffset: -40,
                }}
                enablePoints={false}
                enableGridX={false}
                curve="linear"
                colors={["#cc66ff"]}
                lineWidth={2}
                enableArea={false}
                isInteractive={true}
                useMesh={true}
                tooltip={({ point }) => (
                    <div
                        style={{
                            background: "#222",
                            padding: "8px",
                            borderRadius: "4px",
                            color: "#cc66ff",
                            fontSize: "12px",
                        }}>
                        <div>
                            时间: {new Date(point.data.x).toLocaleTimeString()}
                        </div>
                        <div>值: {point.data.y.toFixed(5)}</div>
                    </div>
                )}
                markers={[{
                    axis: "y",
                    value: threshold,
                    lineStyle: {
                        stroke: "red",
                        strokeWidth: 2,
                        strokeDasharray: "4 4",
                    },
                    legendPosition: "top-left",
                    legendOrientation: "horizontal",
                }]}
            />
        </div>
    );
};

export default EarWaveform;
