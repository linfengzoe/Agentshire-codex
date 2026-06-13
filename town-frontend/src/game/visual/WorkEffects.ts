// @desc Work-related VFX: thinking aura, working stream, file icon, search radar, connection beam, hook flash, progress ring.
import * as THREE from 'three'
import { TEMP_VEC, type ParticlePool } from './ParticlePool'
import type { EffectRegistry } from './EffectRegistry'

export class WorkEffects {
  constructor(
    private pool: ParticlePool,
    private registry: EffectRegistry,
  ) {}

  thinkingAura(target: THREE.Object3D): void {
    const id = this.registry.nextId()
    this.registry.addEffect({
      id, type: 'thinkingAura', target, elapsed: 0, duration: Infinity, params: {},
      update: (dt, eff) => {
        eff.elapsed += dt
        if (!eff.target) return false
        if (eff.target.userData?.isInActiveScene === false) return true
        const pos = new THREE.Vector3()
        eff.target.getWorldPosition(pos)
        pos.y += 2.0

        if (Math.random() < dt * 8) {
          const angle = Math.random() * Math.PI * 2
          const r = 0.3 + Math.random() * 0.2
          this.pool.emitParticles(1, pos.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r)), {
            velocity: () => new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.2),
            color: () => new THREE.Color().setHSL(0.15 + Math.random() * 0.1, 0.8, 0.7),
            size: () => 0.06 + Math.random() * 0.04,
            life: () => 0.8 + Math.random() * 0.6,
            emissive: 2,
          })
        }
        return true
      },
    })

    const scene = this.registry.getScene()
    const ringGeo = new THREE.TorusGeometry(0.35, 0.03, 8, 24)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    const pos = new THREE.Vector3()
    target.getWorldPosition(pos)
    ring.position.set(pos.x, pos.y + 2.0, pos.z)
    scene.add(ring)

    this.registry.addMeshEffect({
      mesh: ring,
      update: (dt) => {
        if (!this.registry.findEffect(id)) {
          scene.remove(ring)
          ringGeo.dispose(); ringMat.dispose()
          return false
        }
        if (target.userData?.isInActiveScene === false) {
          ring.visible = false
          return true
        }
        ring.visible = true
        target.getWorldPosition(pos)
        ring.position.set(pos.x, pos.y + 2.0, pos.z)
        ring.rotation.z += dt * 2
        ringMat.opacity = 0.3 + 0.15 * Math.sin(this.registry.findEffect(id)!.elapsed * 3)
        return true
      },
    })
  }

  stopThinkingAura(target: THREE.Object3D): void {
    this.registry.removeEffectsByFilter(e => e.type === 'thinkingAura' && e.target === target)
  }

  workingStream(target: THREE.Object3D): void {
    const id = this.registry.nextId()
    this.registry.addEffect({
      id, type: 'workingStream', target, elapsed: 0, duration: Infinity, params: {},
      update: (dt, eff) => {
        eff.elapsed += dt
        if (!eff.target) return false
        if (eff.target.userData?.isInActiveScene === false) return true
        const pos = new THREE.Vector3()
        eff.target.getWorldPosition(pos)
        pos.y += 1.0

        if (Math.random() < dt * 12) {
          this.pool.emitParticles(1, pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), {
            velocity: () => new THREE.Vector3((Math.random() - 0.5) * 0.5, -1.5 - Math.random(), (Math.random() - 0.5) * 0.5),
            color: () => {
              const hues = [0.3, 0.55, 0.1, 0.45]
              return new THREE.Color().setHSL(hues[Math.floor(Math.random() * hues.length)], 0.9, 0.65)
            },
            size: () => 0.04 + Math.random() * 0.03,
            life: () => 0.5 + Math.random() * 0.4,
            emissive: 1.5,
          })
        }
        return true
      },
    })
  }

  stopWorkingStream(target: THREE.Object3D): void {
    this.registry.removeEffectsByFilter(e => e.type === 'workingStream' && e.target === target)
  }

  fileIcon(target: THREE.Object3D, fileName: string): void {
    const pos = new THREE.Vector3()
    target.getWorldPosition(pos)
    pos.y += 1.5
    const scene = this.registry.getScene()

    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(8, 4, 48, 56)
    ctx.fillStyle = '#4488cc'
    ctx.fillRect(8, 4, 48, 14)
    ctx.fillStyle = '#ffffff'
    ctx.font = '9px monospace'
    ctx.fillText(fileName.slice(0, 8), 12, 14)
    ctx.fillStyle = '#888888'
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(14, 24 + i * 8, 20 + Math.random() * 16, 4)
    }

    const tex = new THREE.CanvasTexture(canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0 })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.scale.set(0.5, 0.5, 1)
    sprite.position.copy(pos)
    scene.add(sprite)

    let life = 0
    this.registry.addMeshEffect({
      mesh: sprite,
      update: (dt) => {
        life += dt
        sprite.position.y = pos.y + life * 0.5
        if (life < 0.3) {
          spriteMat.opacity = life / 0.3
          sprite.scale.setScalar(0.3 + life / 0.3 * 0.2)
        } else if (life > 2.0) {
          spriteMat.opacity = Math.max(0, 1 - (life - 2.0) * 2)
        } else {
          spriteMat.opacity = 1
          sprite.scale.setScalar(0.5)
        }
        sprite.scale.z = 1
        if (life > 2.5) {
          scene.remove(sprite)
          tex.dispose(); spriteMat.dispose()
          return false
        }
        return true
      },
    })
  }

  terminalScreen(target: THREE.Object3D, label: string): void {
    this.floatingPanel(target, 192, 112, 1.25, 0.72, (ctx) => {
      ctx.fillStyle = '#07110b'
      ctx.fillRect(0, 0, 192, 112)
      ctx.fillStyle = '#123822'
      ctx.fillRect(0, 0, 192, 18)
      ctx.fillStyle = '#34d399'
      ctx.font = 'bold 11px monospace'
      ctx.fillText('terminal', 10, 13)
      ctx.font = '13px monospace'
      const text = label || 'shell_command'
      const lines = [`> ${text.slice(0, 24)}`, text.slice(24, 48), 'running...']
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 12, 42 + i * 20)
      }
    })
  }

  browserProjection(target: THREE.Object3D, label: string): void {
    this.floatingPanel(target, 180, 112, 1.2, 0.74, (ctx) => {
      ctx.fillStyle = '#e0f2fe'
      ctx.fillRect(0, 0, 180, 112)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, 180, 18)
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(12, 30, 156, 10)
      ctx.fillStyle = '#7dd3fc'
      ctx.fillRect(12, 50, 98, 10)
      ctx.fillStyle = '#bae6fd'
      ctx.fillRect(12, 70, 132, 10)
      ctx.fillStyle = '#0369a1'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText((label || 'browser').slice(0, 22), 12, 101)
    })
  }

  constructionBurst(target: THREE.Object3D): void {
    const pos = new THREE.Vector3()
    target.getWorldPosition(pos)
    pos.y += 1.3
    this.pool.emitParticles(18, pos, {
      velocity: () => new THREE.Vector3((Math.random() - 0.5) * 2.2, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.2),
      color: () => new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.9, 0.6),
      size: () => 0.06 + Math.random() * 0.05,
      life: () => 0.45 + Math.random() * 0.45,
      emissive: 2,
    })
    this.floatingPanel(target, 96, 64, 0.72, 0.48, (ctx) => {
      ctx.fillStyle = '#451a03'
      ctx.fillRect(0, 0, 96, 64)
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(12, 16, 72, 10)
      ctx.fillRect(28, 28, 40, 10)
      ctx.fillStyle = '#fed7aa'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('PATCH', 26, 52)
    }, 1.6)
  }

  statusLight(target: THREE.Object3D, status: string, label: string): void {
    const color = status === 'failed' ? 0xef4444 : status === 'passed' ? 0x22c55e : 0x38bdf8
    const scene = this.registry.getScene()
    const geo = new THREE.SphereGeometry(0.16, 16, 12)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    const mesh = new THREE.Mesh(geo, mat)
    scene.add(mesh)

    const light = new THREE.PointLight(color, 1.4, 3)
    scene.add(light)

    let life = 0
    this.registry.addMeshEffect({
      mesh,
      update: (dt) => {
        life += dt
        target.getWorldPosition(TEMP_VEC)
        const bounce = Math.sin(life * 5) * 0.08
        mesh.position.set(TEMP_VEC.x, TEMP_VEC.y + 2.25 + bounce, TEMP_VEC.z)
        light.position.copy(mesh.position)
        const scale = 1 + Math.sin(life * 8) * 0.18
        mesh.scale.setScalar(scale)
        if (life > 2.4) {
          mat.opacity = Math.max(0, 1 - (life - 2.4) * 2)
          light.intensity = mat.opacity * 1.4
        }
        if (life > 2.9) {
          scene.remove(mesh)
          scene.remove(light)
          geo.dispose(); mat.dispose()
          return false
        }
        return true
      },
    })

    if (label) {
      this.floatingPanel(target, 112, 40, 0.78, 0.28, (ctx) => {
        ctx.fillStyle = status === 'failed' ? '#7f1d1d' : status === 'passed' ? '#14532d' : '#075985'
        ctx.fillRect(0, 0, 112, 40)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 13px sans-serif'
        ctx.fillText(`${label}: ${status}`, 10, 25)
      }, 1.8, 2.55)
    }
  }

  private floatingPanel(
    target: THREE.Object3D,
    width: number,
    height: number,
    scaleX: number,
    scaleY: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
    duration = 2.2,
    yOffset = 1.75,
  ): void {
    const scene = this.registry.getScene()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    draw(ctx)

    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0 })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(scaleX, scaleY, 1)
    scene.add(sprite)

    let life = 0
    this.registry.addMeshEffect({
      mesh: sprite,
      update: (dt) => {
        life += dt
        target.getWorldPosition(TEMP_VEC)
        sprite.position.set(TEMP_VEC.x, TEMP_VEC.y + yOffset + life * 0.12, TEMP_VEC.z)
        if (life < 0.2) mat.opacity = life / 0.2
        else if (life > duration - 0.45) mat.opacity = Math.max(0, (duration - life) / 0.45)
        else mat.opacity = 0.92
        if (life > duration) {
          scene.remove(sprite)
          tex.dispose(); mat.dispose()
          return false
        }
        return true
      },
    })
  }

  searchRadar(target: THREE.Object3D): void {
    const pos = new THREE.Vector3()
    target.getWorldPosition(pos)
    pos.y += 2.2
    const scene = this.registry.getScene()

    for (let wave = 0; wave < 3; wave++) {
      setTimeout(() => {
        const ringGeo = new THREE.TorusGeometry(0.1, 0.015, 6, 24)
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ddff, transparent: true, opacity: 0.7 })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.rotation.x = -Math.PI / 2
        target.getWorldPosition(pos)
        ring.position.set(pos.x, pos.y + 2.2, pos.z)
        scene.add(ring)

        let life = 0
        this.registry.addMeshEffect({
          mesh: ring,
          update: (dt) => {
            life += dt
            target.getWorldPosition(TEMP_VEC)
            ring.position.set(TEMP_VEC.x, TEMP_VEC.y + 2.2, TEMP_VEC.z)
            const scale = 1 + life * 6
            ring.scale.set(scale, scale, 1)
            ringMat.opacity = Math.max(0, 0.7 - life * 0.9)
            if (life > 0.8) {
              scene.remove(ring)
              ringGeo.dispose(); ringMat.dispose()
              return false
            }
            return true
          },
        })
      }, wave * 300)
    }
  }

  connectionBeam(from: THREE.Object3D, to: THREE.Object3D): void {
    const posA = new THREE.Vector3()
    const posB = new THREE.Vector3()
    from.getWorldPosition(posA); posA.y += 1.2
    to.getWorldPosition(posB); posB.y += 1.2
    const scene = this.registry.getScene()

    const lineGeo = new THREE.BufferGeometry().setFromPoints([posA, posB])
    const lineMat = new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.6 })
    const line = new THREE.Line(lineGeo, lineMat)
    scene.add(line)

    const mid = posA.clone().lerp(posB, 0.5)
    this.pool.emitParticles(8, mid, {
      velocity: () => {
        const dir = posB.clone().sub(posA).normalize()
        return dir.multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 0.5, 0))
      },
      color: () => new THREE.Color(0.3, 0.7, 1),
      size: () => 0.05,
      life: () => 0.6 + Math.random() * 0.4,
      emissive: 2,
    })

    let life = 0
    this.registry.addMeshEffect({
      mesh: line,
      update: (dt) => {
        life += dt
        from.getWorldPosition(posA); posA.y += 1.2
        to.getWorldPosition(posB); posB.y += 1.2
        const positions = lineGeo.attributes.position as THREE.BufferAttribute
        positions.setXYZ(0, posA.x, posA.y, posA.z)
        positions.setXYZ(1, posB.x, posB.y, posB.z)
        positions.needsUpdate = true
        lineMat.opacity = Math.max(0, 0.6 - life * 0.3)
        if (life > 2) {
          scene.remove(line)
          lineGeo.dispose(); lineMat.dispose()
          return false
        }
        return true
      },
    })
  }

  hookFlash(target: THREE.Object3D): void {
    const pos = new THREE.Vector3()
    target.getWorldPosition(pos)
    pos.y += 2.0
    this.pool.emitParticles(6, pos, {
      velocity: () => new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2),
      color: () => new THREE.Color(1, 0.8, 0.2),
      size: () => 0.08,
      life: () => 0.4 + Math.random() * 0.3,
      emissive: 2,
    })
  }

  progressRing(target: THREE.Object3D): number {
    const id = this.registry.nextId()
    const scene = this.registry.getScene()
    const ringGeo = new THREE.TorusGeometry(0.25, 0.02, 6, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x44ccff, transparent: true, opacity: 0.6 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    scene.add(ring)

    this.registry.addEffect({
      id, type: 'progressRing', target, elapsed: 0, duration: Infinity, params: { ring, ringGeo, ringMat },
      update: (dt, eff) => {
        eff.elapsed += dt
        if (!eff.target) return false
        target.getWorldPosition(TEMP_VEC)
        ring.position.set(TEMP_VEC.x, TEMP_VEC.y + 2.3, TEMP_VEC.z)
        ring.rotation.z += dt * 3
        ringMat.opacity = 0.4 + 0.2 * Math.sin(eff.elapsed * 4)
        return true
      },
    })
    return id
  }
}
