"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Stars() {
    const ref = useRef<THREE.Points>(null!);

    const { positions, sizes } = useMemo(() => {
        const count = 2000;
        const pos = new Float32Array(count * 3);
        const sz = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 100;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 100;
            sz[i] = Math.random() * 1.5 + 0.2;
        }
        return { positions: pos, sizes: sz };
    }, []);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        ref.current.rotation.y = t * 0.015;
        ref.current.rotation.x = t * 0.007;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positions, 3]}
                />
                <bufferAttribute
                    attach="attributes-size"
                    args={[sizes, 1]}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.12}
                color="#7dd3fc"
                transparent
                opacity={0.65}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}

function NebulaParticles() {
    const ref = useRef<THREE.Points>(null!);

    const positions = useMemo(() => {
        const count = 400;
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = 20 + Math.random() * 30;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i * 3 + 2] = r * Math.cos(phi);
        }
        return pos;
    }, []);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        ref.current.rotation.z = t * 0.02;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial
                size={0.08}
                color="#34d399"
                transparent
                opacity={0.3}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}

export default function StarfieldCanvas() {
    return (
        <div id="starfield-canvas">
            <Canvas
                camera={{ position: [0, 0, 30], fov: 60 }}
                style={{ background: "transparent" }}
                gl={{ antialias: false, alpha: true }}
            >
                <Stars />
                <NebulaParticles />
            </Canvas>
        </div>
    );
}
