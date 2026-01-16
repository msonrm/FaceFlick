import * as THREE from 'three';
import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';
import { GLBAvatar } from '../../hooks/useGLBAvatar';

/**
 * キャリブレーションオフセット（ラジアン）
 */
export interface CalibrationOffset {
  pitch: number;
  yaw: number;
}

/**
 * Blendshapeのオーバーライド設定
 */
export interface BlendshapeOverride {
  jawOpen?: number;
}

/**
 * MediaPipeのblendshapesをGLBモデルに適用する
 * VRMと違い、morph targetsに直接値を設定できる
 */
export function applyMediaPipeToGLB(
  avatar: GLBAvatar,
  result: FaceLandmarkerResult,
  calibrationOffset?: CalibrationOffset,
  blendshapeOverride?: BlendshapeOverride
): void {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return;
  }

  const landmarks = result.faceLandmarks[0];

  // 頭部の回転を適用（ボーンがある場合）
  applyHeadRotation(avatar, landmarks, calibrationOffset);

  // Blendshapesを適用
  applyBlendshapes(avatar, result, blendshapeOverride);
}

/**
 * 頭部の回転をGLBモデルに適用
 */
function applyHeadRotation(
  avatar: GLBAvatar,
  landmarks: any[],
  calibrationOffset?: CalibrationOffset
): void {
  // Kalidokitで頭部の姿勢を計算
  const riggedFace = Kalidokit.Face.solve(landmarks, {
    runtime: 'mediapipe',
    video: null as any,
  });

  if (!riggedFace?.head) {
    return;
  }

  // 頭部ボーンを探す（モデルによって名前が異なる）
  const headBoneNames = ['Head', 'head', 'mixamorigHead', 'Armature_Head'];
  let headBone: THREE.Object3D | null = null;

  for (const name of headBoneNames) {
    headBone = avatar.scene.getObjectByName(name) ?? null;
    if (headBone) break;
  }

  if (!headBone) {
    // headBoneがなければ、シーン全体を回転（顔だけのモデル用）
    let pitch = -riggedFace.head.x;
    let yaw = riggedFace.head.y;
    const roll = riggedFace.head.z;

    if (calibrationOffset) {
      pitch = pitch - calibrationOffset.pitch;
      yaw = yaw - calibrationOffset.yaw;
    }

    avatar.scene.rotation.set(
      pitch * 0.5,
      yaw * 0.5,
      roll * 0.3
    );
    return;
  }

  // 頭部ボーンがある場合
  let pitch = -riggedFace.head.x;
  let yaw = riggedFace.head.y;
  const roll = riggedFace.head.z;

  if (calibrationOffset) {
    pitch = pitch - calibrationOffset.pitch;
    yaw = yaw - calibrationOffset.yaw;
  }

  headBone.rotation.set(
    pitch * 0.6,
    yaw * 0.6,
    roll * 0.4
  );
}

/**
 * MediaPipeのBlendshapesをGLBのmorph targetsに適用
 */
function applyBlendshapes(
  avatar: GLBAvatar,
  result: FaceLandmarkerResult,
  override?: BlendshapeOverride
): void {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return;
  }

  const blendshapes = result.faceBlendshapes[0].categories;

  // 各メッシュにblendshapesを適用
  for (const mesh of avatar.meshes) {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
      continue;
    }

    // MediaPipeのblendshapeをGLBのmorph targetにマッピング
    for (const bs of blendshapes) {
      const name = bs.categoryName;
      let value = bs.score;

      // オーバーライドが設定されている場合は適用
      if (override?.jawOpen !== undefined && name === 'jawOpen') {
        value = override.jawOpen;
      }

      // 直接一致
      let targetIndex = mesh.morphTargetDictionary[name];

      // 見つからない場合、大文字小文字を無視して検索
      if (targetIndex === undefined) {
        const lowerName = name.toLowerCase();
        for (const [key, idx] of Object.entries(mesh.morphTargetDictionary)) {
          if (key.toLowerCase() === lowerName) {
            targetIndex = idx;
            break;
          }
        }
      }

      // morph targetが見つかった場合、値を設定
      if (targetIndex !== undefined) {
        mesh.morphTargetInfluences[targetIndex] = value;
      }
    }
  }
}

/**
 * GLBモデルのblendshapes値をリセット
 */
export function resetGLBBlendshapes(avatar: GLBAvatar): void {
  for (const mesh of avatar.meshes) {
    if (mesh.morphTargetInfluences) {
      for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
        mesh.morphTargetInfluences[i] = 0;
      }
    }
  }
}

/**
 * GLBモデルの透明度を設定
 * @param avatar GLBAvatar
 * @param opacity 0.0（完全透明）〜 1.0（不透明）
 */
export function setGLBOpacity(avatar: GLBAvatar, opacity: number): void {
  avatar.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        if (material instanceof THREE.Material) {
          material.transparent = true;
          material.opacity = opacity;
          material.needsUpdate = true;
        }
      }
    }
  });
}
