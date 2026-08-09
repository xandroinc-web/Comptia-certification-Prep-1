import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import TechBackground from './TechBackground';

export const SCENE_DURATIONS = { open: 4000, features: 4500, tracking: 4500, pricing: 4000, close: 4000 };

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  open: Scene1,
  features: Scene2,
  tracking: Scene3,
  pricing: Scene4,
  close: Scene5,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#020617]">
      {/* Sophisticated tech background */}
      <TechBackground />

      {/* Persistent midground accent */}
      <motion.div
        className="absolute h-[2px] bg-primary"
        animate={{
          left: ['25%', '5%', '55%', '35%', '15%'][sceneIndex],
          width: ['50%', '90%', '25%', '60%', '40%'][sceneIndex],
          top: ['52%', '12%', '88%', '30%', '70%'][sceneIndex],
          opacity: sceneIndex >= 3 ? 0.4 : 0.9,
        }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Scene Content */}
      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
