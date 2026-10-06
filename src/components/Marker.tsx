import { TextSprite } from './TextSprite';
import type { LightState } from '../lib/horizon';

const COLORS: Record<LightState, string> = { sun: '#ffd27a', shade: '#9cc2ff', night: '#cccccc' };
const LABELS: Record<LightState, string> = {
  sun: 'Direct sunlight',
  shade: 'Shaded by terrain',
  night: 'Sun below horizon',
};

export function Marker({ scale, state }: { scale: number; state: LightState }) {
  const h = 60 * scale;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[5 * scale, 5 * scale, h, 12]} />
        <meshStandardMaterial color="#e34948" />
      </mesh>
      <mesh position={[0, h, 0]} castShadow>
        <sphereGeometry args={[16 * scale, 20, 20]} />
        <meshStandardMaterial color="#e34948" emissive="#5a1010" />
      </mesh>
      <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[30 * scale, 38 * scale, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
      <TextSprite
        text={LABELS[state]}
        position={[0, h + 70 * scale, 0]}
        height={48 * scale}
        color={COLORS[state]}
        background="rgba(0,0,0,0.65)"
      />
    </group>
  );
}
