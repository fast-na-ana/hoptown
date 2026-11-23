// Draw-call reduction: merge sibling meshes that share a material into one mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function prep(mesh) {
  mesh.updateMatrix();
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  g.applyMatrix4(mesh.matrix);
  // keep only the attributes every primitive has
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// Merge direct mesh children of every node in `root`, grouped by material.
export function mergeByMaterial(root) {
  const parents = [];
  root.traverse(o => parents.push(o));
  for (const parent of parents) {
    const byMat = new Map();
    for (const c of parent.children) {
      if (!c.isMesh || c.userData.keep || c.isInstancedMesh) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map(prep);
      const hasColor = geos.every(g => g.attributes.color);
      if (!hasColor) for (const g of geos) g.deleteAttribute('color');
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = list.some(m => m.castShadow);
      mesh.receiveShadow = list.some(m => m.receiveShadow);
      for (const m of list) { parent.remove(m); m.geometry.dispose(); }
      parent.add(mesh);
    }
  }
}

// Bake each mesh's material colour into vertex colours and switch it to one shared material,
// so a whole character can merge down to one mesh per animated part.
export function bakeVertexColors(root, sharedMat, skip) {
  root.traverse(o => {
    if (!o.isMesh || skip(o)) return;
    const c = o.material.color;
    if (o.geometry.index || !o.geometry.userData.ownCopy) { o.geometry = o.geometry.clone(); o.geometry.userData.ownCopy = true; }
    const n = o.geometry.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    o.material = sharedMat;
  });
}
