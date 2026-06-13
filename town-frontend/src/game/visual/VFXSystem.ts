// @desc Facade — delegates every public VFX call to specialised sub-modules. Public API is unchanged.
import * as THREE from 'three'
import { Effects } from './Effects'
import { ParticlePool } from './ParticlePool'
import { EffectRegistry } from './EffectRegistry'
import { SpawnEffects } from './SpawnEffects'
import { WorkEffects } from './WorkEffects'
import { CelebrationEffects } from './CelebrationEffects'
import { DebugEffects } from './DebugEffects'

export class VFXSystem {
  private pool: ParticlePool
  private registry: EffectRegistry
  private fallback: Effects

  private spawn: SpawnEffects
  private work: WorkEffects
  private celebration: CelebrationEffects
  private debug: DebugEffects

  constructor(scene: THREE.Scene, fallback: Effects) {
    this.fallback = fallback

    this.pool = new ParticlePool()
    this.pool.init(scene)

    this.registry = new EffectRegistry()
    this.registry.setScene(scene)

    this.spawn = new SpawnEffects(this.pool, this.registry, fallback)
    this.work = new WorkEffects(this.pool, this.registry)
    this.celebration = new CelebrationEffects(this.pool, this.registry, this.spawn)
    this.debug = new DebugEffects(this.registry)
  }

  // ── Camera ──

  setCamera(camera: THREE.Camera): void {
    this.registry.setCamera(camera)
  }

  // ── Spawn effects ──

  summonShockwave(position: THREE.Vector3): void {
    this.spawn.summonShockwave(position)
  }

  completionFirework(position: THREE.Vector3): void {
    this.spawn.completionFirework(position)
  }

  errorLightning(position: THREE.Vector3): void {
    this.spawn.errorLightning(position)
  }

  personaTransform(target: THREE.Object3D): void {
    this.spawn.personaTransform(target)
  }

  // ── Work effects ──

  thinkingAura(target: THREE.Object3D): void {
    this.work.thinkingAura(target)
  }

  stopThinkingAura(target: THREE.Object3D): void {
    this.work.stopThinkingAura(target)
  }

  workingStream(target: THREE.Object3D): void {
    this.work.workingStream(target)
  }

  stopWorkingStream(target: THREE.Object3D): void {
    this.work.stopWorkingStream(target)
  }

  fileIcon(target: THREE.Object3D, fileName: string): void {
    this.work.fileIcon(target, fileName)
  }

  terminalScreen(target: THREE.Object3D, label: string): void {
    this.work.terminalScreen(target, label)
  }

  browserProjection(target: THREE.Object3D, label: string): void {
    this.work.browserProjection(target, label)
  }

  constructionBurst(target: THREE.Object3D): void {
    this.work.constructionBurst(target)
  }

  statusLight(target: THREE.Object3D, status: string, label: string): void {
    this.work.statusLight(target, status, label)
  }

  searchRadar(target: THREE.Object3D): void {
    this.work.searchRadar(target)
  }

  connectionBeam(from: THREE.Object3D, to: THREE.Object3D): void {
    this.work.connectionBeam(from, to)
  }

  hookFlash(target: THREE.Object3D): void {
    this.work.hookFlash(target)
  }

  progressRing(target: THREE.Object3D): number {
    return this.work.progressRing(target)
  }

  stopEffect(id: number): void {
    this.registry.stopEffectById(id)
  }

  // ── Celebration effects ──

  deployFireworks(position: THREE.Vector3): void {
    this.celebration.deployFireworks(position)
  }

  confetti(center: THREE.Vector3, count?: number, durationMs?: number): void {
    this.celebration.confetti(center, count, durationMs)
  }

  lightPillar(center: THREE.Vector3, durationMs?: number): void {
    this.celebration.lightPillar(center, durationMs)
  }

  skillLearnCeremony(target: THREE.Object3D): void {
    this.celebration.skillLearnCeremony(target)
  }

  // ── Debug effects ──

  routeDebugPath(
    points: Array<{ x: number; y?: number; z: number }>,
    colorHex?: number,
    ttlMs?: number,
  ): void {
    this.debug.routeDebugPath(points, colorHex, ttlMs)
  }

  // ── Lifecycle ──

  update(deltaTime: number): void {
    this.fallback.update(deltaTime)
    this.registry.update(deltaTime)
    this.pool.update(deltaTime)
  }

  setScene(scene: THREE.Scene): void {
    this.pool.setScene(scene)
    this.registry.setScene(scene)
    this.fallback.setScene(scene)
  }

  clear(): void {
    this.pool.clear()
    this.registry.clear()
    this.fallback.clear()
  }
}
