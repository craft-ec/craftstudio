import { useEffect, useRef } from "react";
import { usePeers } from "../hooks/usePeers";
import { Globe } from "lucide-react";

export default function SwarmVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { peers } = usePeers();
    const entries = Object.values(peers);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationId: number;
        let angleOffset = 0;

        const render = () => {
            const width = canvas.width;
            const height = canvas.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 3;

            ctx.clearRect(0, 0, width, height);

            // Draw center node (this node)
            ctx.beginPath();
            ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
            ctx.fillStyle = "#5c7cfa"; // craftec-500
            ctx.fill();
            ctx.shadowColor = "#5c7cfa";
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Draw active peers
            const numPeers = entries.length;
            if (numPeers === 0) {
                // Pulse ring for searching
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * (0.5 + Math.sin(angleOffset) * 0.1), 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(92, 124, 250, 0.2)";
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            entries.forEach((peer: any, i: number) => {
                const angle = (i * (Math.PI * 2)) / numPeers + angleOffset * 0.5;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                // Draw connection line
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(x, y);
                ctx.strokeStyle = "rgba(100, 116, 139, 0.3)"; // theme-muted darker
                ctx.lineWidth = 1;
                ctx.stroke();

                // Draw peer node
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                const isStorage = peer.capabilities.includes("Storage");
                ctx.fillStyle = isStorage ? "#34d399" : "#94a3b8"; // green-400 or theme-muted
                ctx.fill();
                if (isStorage) {
                    ctx.shadowColor = "#34d399";
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }

                // Draw Ping Time
                ctx.fillStyle = "rgba(15, 23, 42, 0.6)"; // theme-text faded
                ctx.font = "10px sans-serif";
                ctx.fillText(`${peer.avg_latency_ms || '<1'}ms`, x + 8, y + 4);
            });

            angleOffset += 0.01;
            animationId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationId);
    }, [entries]);

    return (
        <div className="glass-panel rounded-xl p-4 flex flex-col h-full min-h-[250px] relative overflow-hidden">
            <h3 className="text-sm font-semibold text-theme-text mb-2 flex items-center gap-2 z-10">
                <Globe size={16} className="text-craftec-400" />
                Live Swarm Topology
            </h3>
            <div className="absolute inset-0 z-0">
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className="w-full h-full object-contain opacity-80"
                    style={{ mixBlendMode: 'multiply' }}
                />
            </div>
            <div className="z-10 mt-auto flex justify-between text-xs text-theme-muted">
                <span><span className="inline-block w-2 h-2 rounded-full bg-craftec-500 mr-1"></span>This Node</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-[#34d399] mr-1"></span>Storage Node</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-theme-muted mr-1"></span>Client Node</span>
            </div>
        </div>
    );
}
