import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { OfficeBuilder, type Workstation } from './OfficeBuilder'

describe('OfficeBuilder workstation screen interaction', () => {
  it('returns the workstation hit by a raycast against its monitor', () => {
    const builder = Object.create(OfficeBuilder.prototype) as OfficeBuilder
    const monitorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 0.05),
      new THREE.MeshBasicMaterial(),
    )
    monitorMesh.position.set(10, 1.8, 6)
    monitorMesh.updateMatrixWorld(true)

    const workstation = {
      id: 'B',
      position: new THREE.Vector3(10, 0, 7),
      monitorMesh,
      screenRenderer: { getCanvas: () => ({ width: 256, height: 160 }) },
    } as unknown as Workstation
    builder.workstations = [workstation]

    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(10, 1.8, 8), new THREE.Vector3(0, 0, -1))

    expect(builder.getScreenHit(raycaster)?.id).toBe('B')
    expect(builder.getScreenCanvas('B')).toEqual({ width: 256, height: 160 })
  })
})
