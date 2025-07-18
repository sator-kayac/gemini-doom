// シーン、カメラ、レンダラーの初期化
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// グリッドベースの経路探索のための設定
const GRID_SIZE = 50; // マップのサイズ (例: -25から25まで)
const CELL_SIZE = 1; // グリッドの1セルのサイズ
const GRID_OFFSET = GRID_SIZE / 2; // ワールド座標とグリッドインデックスの変換用

// Web Workerの初期化
const pathfindingWorker = new Worker('pathfindingWorker.js');

// Web Workerからのメッセージを処理
pathfindingWorker.onmessage = function(e) {
    if (e.data.type === 'pathResult') {
        const { path, enemyId } = e.data;
        // 経路探索結果を対応する敵に適用
        const enemy = enemies.find(e => e.uuid === enemyId);
        if (enemy) {
            enemy.currentPath = path;
        }
    }
};

// 照明
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(10, 20, 5);
scene.add(directionalLight);

// マズルフラッシュ
const muzzleFlash = new THREE.PointLight(0xffffff, 100, 50, 2);
muzzleFlash.visible = false;
scene.add(muzzleFlash);

// 床とグリッドの作成
const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0x444444);
scene.add(gridHelper);
const floorGeometry = new THREE.PlaneGeometry(100, 100);
const floorMaterial = new THREE.MeshBasicMaterial({ visible: false });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// 壁の作成
const walls = [];
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });

function createWall(x, y, z, width, height, depth) {
    const wallGeometry = new THREE.BoxGeometry(width, height, depth);
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x, y, z);
    scene.add(wall);
    walls.push(wall);

    // Web Workerに壁の情報を送信
    pathfindingWorker.postMessage({ type: 'updateWall', wall: { x: x, z: z, halfWidth: width / 2, halfDepth: depth / 2 } });
}

// 外壁
createWall(0, 2, -25, 51, 4, 1);
createWall(0, 2, 25, 51, 4, 1);
createWall(-25.5, 2, 0, 1, 4, 50);
createWall(25.5, 2, 0, 1, 4, 50);

// 内壁
createWall(0, 2, 0, 20, 4, 1);
createWall(-15, 2, 12.5, 1, 4, 25);
createWall(15, 2, -12.5, 1, 4, 25);
createWall(0, 2, -12.5, 10, 4, 1);
createWall(0, 2, 12.5, 10, 4, 1);

// プレイヤーの初期位置
camera.position.set(0, 1.8, 20);

// マウス操作のための変数
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isPaused = true; // ゲーム開始時は一時停止状態

// 弾
let isFiring = false;
let lastFireTime = 0;
const fireRate = 0.5;

// マウスポインターロックの設定
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

instructions.addEventListener('click', function () {
    document.body.requestPointerLock();
});

document.addEventListener('pointerlockchange', lockChangeAlert, false);

function lockChangeAlert() {
    if (document.pointerLockElement === document.body) {
        blocker.style.display = 'none';
        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('keydown', onKeyDown, false);
        document.addEventListener('keyup', onKeyUp, false);
        document.addEventListener('mousedown', onMouseDown, false);
        document.addEventListener('mouseup', onMouseUp, false);
        isPaused = false; // ロックされたらゲーム再開
    } else {
        blocker.style.display = 'flex';
        document.removeEventListener('mousemove', onMouseMove, false);
        document.removeEventListener('keydown', onKeyDown, false);
        document.removeEventListener('keyup', onKeyUp, false);
        document.removeEventListener('mousedown', onMouseDown, false);
        document.removeEventListener('mouseup', onMouseUp, false);
        isPaused = true; // ロック解除されたらゲーム一時停止
    }
}

// マウスの動き
function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX * 0.002;
        camera.rotation.x = 0;
    }
}

// キーボード入力
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

const clock = new THREE.Clock();
const playerWidth = 0.5;
const playerHeight = 1.8;

// Three.jsオブジェクトの再利用のための変数
const _vector1 = new THREE.Vector3();
const _vector2 = new THREE.Vector3();
const _vector3 = new THREE.Vector3();
const _vector4 = new THREE.Vector3(); // 新しく追加
const _box1 = new THREE.Box3();
const _box2 = new THREE.Box3();
const _raycaster = new THREE.Raycaster();

let playerHealth = 100;
const healthGaugeCanvas = document.getElementById('health-gauge');
const healthGaugeCtx = healthGaugeCanvas.getContext('2d');
let lastDamageTime = 0;
const damageCooldown = 1.0; // 1秒間のダメージクールダウン

function drawHealthGauge() {
    const centerX = healthGaugeCanvas.width / 2;
    const centerY = healthGaugeCanvas.height / 2;
    const radius = 40;
    const lineWidth = 10;

    healthGaugeCtx.clearRect(0, 0, healthGaugeCanvas.width, healthGaugeCanvas.height);

    // 背景の円
    healthGaugeCtx.beginPath();
    healthGaugeCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    healthGaugeCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    healthGaugeCtx.lineWidth = lineWidth;
    healthGaugeCtx.stroke();

    // ヘルスゲージ
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (playerHealth / 100) * 2 * Math.PI;
    
    healthGaugeCtx.beginPath();
    healthGaugeCtx.arc(centerX, centerY, radius, startAngle, endAngle);
    healthGaugeCtx.strokeStyle = 'red';
    healthGaugeCtx.lineWidth = lineWidth;
    healthGaugeCtx.stroke();

    // ヘルス値のテキスト
    healthGaugeCtx.fillStyle = 'white';
    healthGaugeCtx.font = '20px Arial';
    healthGaugeCtx.textAlign = 'center';
    healthGaugeCtx.textBaseline = 'middle';
    healthGaugeCtx.fillText(playerHealth, centerX, centerY - 20); // 上にずらす
}

function takeDamage(amount) {
    const currentTime = clock.getElapsedTime();
    if (currentTime - lastDamageTime > damageCooldown) {
        playerHealth -= amount;
        if (playerHealth < 0) playerHealth = 0;
        drawHealthGauge(); // ゲージを更新
        lastDamageTime = currentTime;

        // ダメージフラッシュ
        const damageFlash = document.getElementById('damage-flash');
        damageFlash.classList.add('active');
        setTimeout(() => {
            damageFlash.classList.remove('active');
        }, 100); // 0.1秒後にクラスを削除してフェードアウト開始

        if (playerHealth === 0) {
            // ゲームオーバー処理
            alert('ゲームオーバー！');
            // 必要に応じてゲームをリセットするか、別の処理を行う
            location.reload(); // 簡単なリロードでゲームをリセット
        }
    }
}

drawHealthGauge(); // 初期表示

// プレイヤーの衝突判定
function checkPlayerCollision(testPosition) {
    _box1.setFromCenterAndSize(
        _vector1.set(testPosition.x, playerHeight / 2, testPosition.z),
        _vector2.set(playerWidth, playerHeight, playerWidth)
    );

    for (const wall of walls) {
        _box2.setFromObject(wall);
        if (_box1.intersectsBox(_box2)) {
            return wall;
        }
    }
    return null;
}

// 敵を壁の外側に押し出す関数
function pushEnemyOutOfWall(enemy, oldPosition) {
    _box1.setFromObject(enemy);
    
    for (const wall of walls) {
        _box2.setFromObject(wall);
        if (_box1.intersectsBox(_box2)) {
            // 壁の中心と敵の位置から押し出し方向を計算
            const wallCenter = _vector1.copy(wall.position);
            const enemyPos = _vector2.copy(enemy.position);
            
            // 壁から敵への方向ベクトル
            const pushDirection = _vector3.copy(enemyPos).sub(wallCenter);
            pushDirection.y = 0; // Y軸は無視
            
            if (pushDirection.lengthSq() < 0.1) {
                // 敵が壁の中心にいる場合、ランダムな方向に押し出す
                pushDirection.set(
                    (Math.random() - 0.5) * 2,
                    0,
                    (Math.random() - 0.5) * 2
                );
            }
            
            pushDirection.normalize();
            
            // 壁のサイズを取得
            const wallSize = _vector4.subVectors(_box2.max, _box2.min);
            const maxWallSize = Math.max(wallSize.x, wallSize.z);
            
            // 押し出し距離を計算（壁のサイズの半分 + 敵のサイズ + 少しの余裕）
            const pushDistance = maxWallSize * 0.5 + 1.5;
            
            // 新しい位置を計算
            const newPosition = _vector1.copy(wallCenter).add(
                pushDirection.multiplyScalar(pushDistance)
            );
            newPosition.y = enemy.position.y; // Y座標は維持
            
            // マップ境界内に収める
            newPosition.x = Math.max(-24, Math.min(24, newPosition.x));
            newPosition.z = Math.max(-24, Math.min(24, newPosition.z));
            
            enemy.position.copy(newPosition);
            return; // 1つの壁からの押し出しで十分
        }
    }
    
    // どの壁とも衝突していない場合は元の位置に戻す
    enemy.position.copy(oldPosition);
}

// 敵
const enemies = [];
const dyingEnemies = []; // 死亡中の敵を管理する配列

// 仮の敵モデルを作成する関数
function createSimpleEnemy(isShooter = false) {
    const enemyGroup = new THREE.Group();
    const color = isShooter ? 0xff0000 : 0x00ff00; // 射撃タイプは赤、通常は緑
    const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 });

    // 体
    const bodyGeometry = new THREE.BoxGeometry(1, 1.5, 0.5);
    const body = new THREE.Mesh(bodyGeometry, material);
    body.position.y = 1.25; // 地面から少し浮かす
    enemyGroup.add(body);

    // 頭
    const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 2.2; // 体の上に配置
    enemyGroup.add(head);

    // 腕 (左右)
    const armGeometry = new THREE.BoxGeometry(0.3, 1, 0.3);
    const leftArm = new THREE.Mesh(armGeometry, material);
    leftArm.position.set(-0.6, 1.25, 0);
    enemyGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, material);
    rightArm.position.set(0.6, 1.25, 0);
    enemyGroup.add(rightArm);

    // 射撃タイプの場合、銃を追加
    if (isShooter) {
        const gunGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.8);
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const gun = new THREE.Mesh(gunGeometry, gunMaterial);
        gun.position.set(0, 0, 0.4); // 腕の前に配置
        rightArm.add(gun); // 右腕の子オブジェクトとして追加
        rightArm.rotation.x = -Math.PI / 4; // 少し腕を前に傾ける
    }

    // 足 (左右)
    const legGeometry = new THREE.BoxGeometry(0.4, 1, 0.4);
    const leftLeg = new THREE.Mesh(legGeometry, material);
    leftLeg.position.set(-0.3, 0.5, 0);
    enemyGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, material);
    rightLeg.position.set(0.3, 0.5, 0);
    enemyGroup.add(rightLeg);

    return enemyGroup;
}

// コイン
let coins = 0;
const coinCounterElement = document.getElementById('coin-counter');
const activeCoins = [];
const coinGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16);
const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.4 });

function updateCoinCounter() {
    coinCounterElement.textContent = `Coins: ${coins}`;
}

function spawnCoins(position) {
    for (let i = 0; i < 3; i++) { // コインの数を10から3に減らす
        const coin = new THREE.Mesh(coinGeometry, coinMaterial);
        coin.position.copy(position);
        coin.position.y += 1;

        const randomX = (Math.random() - 0.5) * 4;
        const randomY = Math.random() * 4 + 2;
        const randomZ = (Math.random() - 0.5) * 4;
        coin.velocity = new THREE.Vector3(randomX, randomY, randomZ);

        coin.spawnTime = clock.getElapsedTime();
        coin.homing = false;
        coin.homingStartTime = 0; // ホーミング開始時間を記録
        coin.startPosition = new THREE.Vector3(); // ホーミング開始時の位置
        coin.targetPosition = new THREE.Vector3(); // ホーミング目標位置

        scene.add(coin);
        activeCoins.push(coin);
    }
}

function spawnEnemy() {
    const isShooter = Math.random() < 0.25; // 25%の確率で射撃タイプ
    const enemy = createSimpleEnemy(isShooter);
    enemy.isShooter = isShooter;
    enemy.lastShotTime = 0; // 最後に撃った時間
    enemy.lastPathUpdateTime = 0; // 最後に経路を更新した時間
    enemy.currentPath = []; // 現在の経路

    let attempts = 0;
    const maxAttempts = 5; // 最大試行回数を設定

    while (attempts < maxAttempts) {
        attempts++;
        let collision = false;
        const x = Math.random() * 48 - 24;
        const z = Math.random() * 48 - 24;

        enemy.position.set(x, 0, z); // yを0に調整

        // プレイヤーからの距離が近すぎないかチェック
        const distanceToPlayer = enemy.position.distanceTo(camera.position);
        if (distanceToPlayer < 10) { // 10単位以内にはスポーンさせない
            collision = true;
        }

        // 視界内かどうかのチェック（簡易的なもの）
        const enemyDirection = enemy.position.clone().sub(camera.position).normalize();
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const dotProduct = cameraDirection.dot(enemyDirection);

        if (dotProduct > 0.5) {
            collision = true;
        }

        // 既存の壁との衝突チェック
        _box1.setFromObject(enemy);
        for (const wall of walls) {
            _box2.setFromObject(wall);
            if (_box1.intersectsBox(_box2)) {
                collision = true;
                break;
            }
        }
        if (!collision) break;
    }

    // 5回試行しても配置できない場合は、制約を緩和してプレイヤーから離れた場所に強制配置
    if (attempts >= maxAttempts) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 15 + Math.random() * 10; // プレイヤーから15-25単位離れた場所
        const x = camera.position.x + Math.cos(angle) * distance;
        const z = camera.position.z + Math.sin(angle) * distance;
        
        // マップ境界内に収める
        enemy.position.set(
            Math.max(-24, Math.min(24, x)),
            0,
            Math.max(-24, Math.min(24, z))
        );
    }
    scene.add(enemy);
    enemies.push(enemy);
}

for (let i = 0; i < 8; i++) { // 初期敵数を8体に設定
    spawnEnemy();
}

// 弾
const bullets = [];
const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });

// 敵の弾
const enemyBullets = [];
const enemyBulletGeometry = new THREE.SphereGeometry(0.15, 8, 8);
const enemyBulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// アイテム
const items = [];
const itemGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const speedUpMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, metalness: 0.8, roughness: 0.2 });
const rapidFireMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.8, roughness: 0.2 });

let speedUpActive = false;
let rapidFireActive = false;
let speedUpTimer = 0;
let rapidFireTimer = 0;

// UI要素の取得
const speedUpTimerElement = document.getElementById('speedup-timer');
const rapidFireTimerElement = document.getElementById('rapidfire-timer');

function spawnItem(position) {
    const itemType = Math.random() < 0.5 ? 'speed' : 'rapid';
    const material = itemType === 'speed' ? speedUpMaterial : rapidFireMaterial;
    const item = new THREE.Mesh(itemGeometry, material);
    item.position.copy(position);
    item.position.y = 0.5;
    item.itemType = itemType;
    scene.add(item);
    items.push(item);
}

function onMouseDown(event) {
    if (event.button === 0) {
        isFiring = true;
        // クリック時に即座に発射し、連打に対応する
        fireBullet();
    }
}

function onMouseUp(event) {
    if (event.button === 0) {
        isFiring = false;
    }
}

function fireBullet() {
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(camera.position);

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    bullet.velocity = cameraDirection.multiplyScalar(50);

    scene.add(bullet);
    bullets.push(bullet);
    lastFireTime = clock.getElapsedTime();

    // マズルフラッシュを表示
    muzzleFlash.position.copy(camera.position);
    muzzleFlash.visible = true;
    setTimeout(() => {
        muzzleFlash.visible = false;
    }, 60); // 60ミリ秒後に非表示
}

function animate() {
    requestAnimationFrame(animate);

    if (isPaused) {
        renderer.render(scene, camera);
        return;
    }

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    const moveSpeed = 5.0;

    // 難易度係数 (30秒ごとに10%上昇)
    const difficultyMultiplier = 1.0 + Math.floor(elapsedTime / 30) * 0.1;

    // アイテム効果の処理
    if (speedUpActive) {
        speedUpTimer -= delta;
        speedUpTimerElement.textContent = `Speed Up: ${speedUpTimer.toFixed(1)}s`;
        speedUpTimerElement.classList.add('active');
        if (speedUpTimer <= 0) {
            speedUpActive = false;
            speedUpTimerElement.classList.remove('active');
        }
    } else {
        speedUpTimerElement.classList.remove('active');
    }

    if (rapidFireActive) {
        rapidFireTimer -= delta;
        rapidFireTimerElement.textContent = `Rapid Fire: ${rapidFireTimer.toFixed(1)}s`;
        rapidFireTimerElement.classList.add('active');
        if (rapidFireTimer <= 0) {
            rapidFireActive = false;
            rapidFireTimerElement.classList.remove('active');
        }
    } else {
        rapidFireTimerElement.classList.remove('active');
    }

    const currentMoveSpeed = speedUpActive ? moveSpeed * 2 : moveSpeed;

    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(camera.position.x, playerHeight / 2, camera.position.z),
        new THREE.Vector3(playerWidth, playerHeight, playerWidth)
    );

    const oldPosition = camera.position.clone();
    const moveDirection = _vector1.set(0, 0, 0);
    
    const forward = _vector2;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = _vector3.crossVectors(forward, camera.up).normalize();

    if (moveForward) moveDirection.add(forward);
    if (moveBackward) moveDirection.sub(forward);
    if (moveRight) moveDirection.add(right);
    if (moveLeft) moveDirection.sub(right);

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        const moveStep = moveDirection.multiplyScalar(currentMoveSpeed * delta);

        const newPositionX = camera.position.x + moveStep.x;
        const newPositionZ = camera.position.z + moveStep.z;

        // X軸方向の移動を試行
        camera.position.x = newPositionX;
        if (checkPlayerCollision(camera.position)) {
            camera.position.x = oldPosition.x; // 衝突したら元に戻す
        }

        // Z軸方向の移動を試行
        camera.position.z = newPositionZ;
        if (checkPlayerCollision(camera.position)) {
            camera.position.z = oldPosition.z; // 衝突したら元に戻す
        }
    }

    const currentFireRate = rapidFireActive ? fireRate / 2 : fireRate;
    if (isFiring && (elapsedTime - lastFireTime > currentFireRate)) {
        fireBullet();
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.position.add(bullet.velocity.clone().multiplyScalar(delta));

        let bulletRemoved = false;
        _box1.setFromCenterAndSize(bullet.position, _vector1.set(0.2, 0.2, 0.2));

        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            _box2.setFromObject(enemy);
            if (_box1.intersectsBox(_box2)) {
                spawnCoins(enemy.position.clone());
                
                // 敵を死亡状態にする
                enemy.isDying = true;
                enemy.deathTime = elapsedTime;
                // 弾の方向に強く、少し上に吹っ飛ぶように調整
                const blastDirection = bullet.velocity.clone().normalize();
                blastDirection.y += 0.3; // Y軸方向に少しベクトルを加える
                enemy.deathVelocity = blastDirection.normalize().multiplyScalar(15); 
                // ランダムな角速度を設定して回転させる
                enemy.deathAngularVelocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10
                );

                // 敵の色をグレイスケールに変更
                enemy.traverse(child => {
                    if (child.isMesh) {
                        child.material = child.material.clone(); // マテリアルを複製して他の敵に影響しないようにする
                        child.material.color.set(0x808080);
                    }
                });

                scene.remove(bullet);
                bullets.splice(i, 1);
                enemies.splice(j, 1); // enemies配列からは削除
                dyingEnemies.push(enemy); // dyingEnemies配列に追加

                // 確率でアイテムをドロップ
                if (Math.random() < 0.05) { // 5%の確率
                    spawnItem(enemy.position.clone());
                }

                // 敵の最大数を制限
                if (enemies.length < 8) { // 最大8体まで
                    spawnEnemy();
                }
                bulletRemoved = true;
                break;
            }
        }
        if (bulletRemoved) continue;

        for (const wall of walls) {
            _box2.setFromObject(wall);
            if (_box1.intersectsBox(_box2)) {
                scene.remove(bullet);
                bullets.splice(i, 1);
                bulletRemoved = true;
                break;
            }
        }
        if (bulletRemoved) continue;

        if (bullet.position.y < -10 || bullet.position.y > 50 || Math.abs(bullet.position.x) > 50 || Math.abs(bullet.position.z) > 50) {
            scene.remove(bullet);
            bullets.splice(i, 1);
        }
    }

    for (let i = activeCoins.length - 1; i >= 0; i--) {
        const coin = activeCoins[i];

        if (!coin.homing && elapsedTime - coin.spawnTime > 3) {
            coin.homing = true;
        }

        if (coin.homing) {
            if (coin.homingStartTime === 0) {
                coin.homingStartTime = elapsedTime;
                coin.startPosition.copy(coin.position);
                coin.targetPosition.copy(camera.position);
                coin.targetPosition.y = 0.5; // プレイヤーの足元をターゲット
            }

            const duration = 0.5; // ホーミングにかかる時間
            const elapsedHomingTime = elapsedTime - coin.homingStartTime;
            const t = Math.min(1, elapsedHomingTime / duration);

            // 放物線補間
            const p0 = coin.startPosition;
            const p1 = new THREE.Vector3(
                (p0.x + coin.targetPosition.x) / 2,
                Math.max(p0.y, coin.targetPosition.y) + 2, // 放物線の高さ
                (p0.z + coin.targetPosition.z) / 2
            );
            const p2 = coin.targetPosition;

            coin.position.x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
            coin.position.y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
            coin.position.z = (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * p1.z + t * t * p2.z;

            coin.rotation.x += 0.2; // 回転速度を調整
            coin.rotation.y += 0.2; // 回転速度を調整

            if (t >= 1) {
                coins += 1;
                updateCoinCounter();
                scene.remove(coin);
                activeCoins.splice(i, 1);
            }
        } else {
            coin.position.add(coin.velocity.clone().multiplyScalar(delta));
            coin.velocity.y -= 9.8 * delta;

            if (coin.position.y < 0.05) {
                coin.position.y = 0.05;
                coin.velocity.y *= -0.6;
                coin.velocity.x *= 0.9;
                coin.velocity.z *= 0.9;
            }
        }
    }

    // 敵の処理を間引いてパフォーマンス向上
    const processEnemyFrame = Math.floor(elapsedTime * 30) % 2 === 0; // 30FPSで半分の敵を処理
    
    for (let j = enemies.length - 1; j >= 0; j--) {
        const enemy = enemies[j];
        const oldEnemyPos = enemy.position.clone();
        
        // フレームスキップで敵処理を軽量化
        if (!processEnemyFrame && j % 2 === 0) {
            continue; // 偶数インデックスの敵をスキップ
        }

        // プレイヤーの視界内かどうかの判定
        const playerToEnemy = _vector1.copy(enemy.position).sub(camera.position);
        const distanceToPlayer = playerToEnemy.length();
        playerToEnemy.normalize();

        const cameraForward = _vector2;
        camera.getWorldDirection(cameraForward);

        const angleToEnemy = cameraForward.angleTo(playerToEnemy);
        const fovAngle = Math.PI / 2; // プレイヤーの視野角 90度

        // プレイヤーの視界外にいる敵は移動処理をスキップ（射撃判定は後で行う）
        const isInPlayerView = angleToEnemy <= fovAngle || distanceToPlayer <= 5;
        if (!isInPlayerView) {
            // 視界外の敵は射撃判定のみ行い、移動はスキップ
            if (enemy.isShooter) {
                // 射撃処理のみ実行（後述）
            }
            continue;
        }

        // 敵の現在位置をグリッド座標に変換
        const enemyGridX = Math.floor((enemy.position.x + GRID_OFFSET) / CELL_SIZE);
        const enemyGridZ = Math.floor((enemy.position.z + GRID_OFFSET) / CELL_SIZE);

        // プレイヤーの現在位置をグリッド座標に変換
        const playerGridX = Math.floor((camera.position.x + GRID_OFFSET) / CELL_SIZE);
        const playerGridZ = Math.floor((camera.position.z + GRID_OFFSET) / CELL_SIZE);

        // 敵からプレイヤーへのRaycastで障害物がないかチェック
        const rayDirection = _vector3.copy(camera.position).sub(enemy.position).normalize();
        _raycaster.set(enemy.position, rayDirection);
        const obstacles = [...walls]; // 壁のみを障害物として判定
        const intersects = _raycaster.intersectObjects(obstacles, true);

        let useDirectPath = false;
        if (intersects.length === 0 || intersects[0].distance > distanceToPlayer) {
            // 障害物がない場合、単純接近（直線移動）
            useDirectPath = true;
            enemy.currentPath = null; // A*パスをクリア
        } else {
            // 障害物がある場合、A*アルゴリズムで経路を探索
            if (elapsedTime - enemy.lastPathUpdateTime > 2.0 || !enemy.currentPath || enemy.currentPath.length === 0 || 
                (enemy.currentPath.length > 1 && (enemy.currentPath[enemy.currentPath.length - 1].x !== playerGridX || enemy.currentPath[enemy.currentPath.length - 1].y !== playerGridZ))) {
                pathfindingWorker.postMessage({
                    type: 'findPath',
                    startX: enemyGridX,
                    startY: enemyGridZ,
                    endX: playerGridX,
                    endY: playerGridZ,
                    enemyId: enemy.uuid
                });
                enemy.lastPathUpdateTime = elapsedTime;
            }
        }

        // 敵の移動処理
        if (useDirectPath) {
            // 単純接近：プレイヤーに直線的に向かう
            const targetDirection = _vector1.copy(camera.position).sub(enemy.position);
            targetDirection.y = 0; // Y軸は無視
            const distanceToTarget = targetDirection.length();
            
            if (distanceToTarget > 1.0) { // プレイヤーから一定距離離れている場合のみ移動
                targetDirection.normalize();
                
                // 敵の向きを更新
                enemy.lookAt(camera.position.x, enemy.position.y, camera.position.z);
                
                // 敵を移動
                const enemySpeed = 2.0 * difficultyMultiplier;
                const moveStep = targetDirection.multiplyScalar(enemySpeed * delta);
                const newPosition = enemy.position.clone().add(moveStep);
                
                // 壁との衝突チェック
                enemy.position.copy(newPosition);
                _box1.setFromObject(enemy);
                let collision = false;
                
                for (const wall of walls) {
                    _box2.setFromObject(wall);
                    if (_box1.intersectsBox(_box2)) {
                        collision = true;
                        break;
                    }
                }
                
                if (collision) {
                    pushEnemyOutOfWall(enemy, oldEnemyPos); // 壁の外側に押し出す
                }
            }
        } else if (enemy.currentPath && enemy.currentPath.length > 1) {
            // A*経路を使った移動
            const targetGrid = enemy.currentPath[1]; // インデックス0は現在位置、1が次の目標
            const targetWorldX = (targetGrid.x - GRID_OFFSET) * CELL_SIZE;
            const targetWorldZ = (targetGrid.y - GRID_OFFSET) * CELL_SIZE;
            
            // 目標位置への方向ベクトルを計算
            const targetDirection = _vector1.set(targetWorldX, enemy.position.y, targetWorldZ).sub(enemy.position);
            const distanceToTarget = targetDirection.length();
            
            if (distanceToTarget > 0.5) { // 目標に近づいていない場合
                targetDirection.normalize();
                
                // 敵の向きを更新
                enemy.lookAt(targetWorldX, enemy.position.y, targetWorldZ);
                
                // 敵を移動
                const enemySpeed = 2.0 * difficultyMultiplier;
                const moveStep = targetDirection.multiplyScalar(enemySpeed * delta);
                const newPosition = enemy.position.clone().add(moveStep);
                
                // 壁との衝突チェック
                enemy.position.copy(newPosition);
                _box1.setFromObject(enemy);
                let collision = false;
                
                for (const wall of walls) {
                    _box2.setFromObject(wall);
                    if (_box1.intersectsBox(_box2)) {
                        collision = true;
                        break;
                    }
                }
                
                if (collision) {
                    pushEnemyOutOfWall(enemy, oldEnemyPos); // 壁の外側に押し出す
                } else {
                    // 目標に到達したら、パスから次のポイントを削除
                    if (distanceToTarget < 1.0) {
                        enemy.currentPath.shift();
                    }
                }
            } else {
                // 目標に到達したら、パスから次のポイントを削除
                enemy.currentPath.shift();
            }
        }

        // 敵とプレイヤーの衝突判定
        _box1.setFromObject(enemy);
        if (_box1.intersectsBox(playerBox)) {
            takeDamage(10); // 敵に接触すると10ダメージ
            // 近接攻撃の敵は接触時に消滅
            if (!enemy.isShooter) {
                scene.remove(enemy);
                enemies.splice(j, 1);
                // 敵の数を維持するため新しい敵を追加
                if (enemies.length < 8) {
                    spawnEnemy();
                }
                continue; // 次の敵へ
            }
        }

        // 射撃タイプの敵の処理
        if (enemy.isShooter) {
            const distanceToPlayer = enemy.position.distanceTo(camera.position);
            const canShoot = elapsedTime - enemy.lastShotTime > 2.0; // 2秒に1回発射可能

            if (distanceToPlayer < 20 && canShoot) { // プレイヤーが20単位以内にいる場合
                const firePosition = enemy.position.clone();
                firePosition.y += 1.5; // 銃口の高さに合わせる

                // --- 射撃条件の判定 ---
                const enemyForward = _vector1;
                enemy.getWorldDirection(enemyForward);
                const playerDirection = _vector2.copy(camera.position).sub(enemy.position).normalize();

                // 水平方向の角度を計算するために、Y軸の情報を無視する
                const enemyForwardHorizontal = _vector3.copy(enemyForward).setY(0).normalize();
                const playerDirectionHorizontal = _vector4.copy(playerDirection).setY(0).normalize(); // _vector4を使用
                const angle = enemyForwardHorizontal.angleTo(playerDirectionHorizontal);

                // 条件1: 視界内か (視野角60度)
                const isPlayerInFov = angle < (Math.PI / 3);
                // 条件2: 正確に狙っているか (角度5度以内)
                const isAiming = angle < (5 * Math.PI / 180);

                if (isPlayerInFov && isAiming) {
                    // 条件3: 射線上に障害物がないか (Raycasting)
                    const rayDirection = _vector1.copy(camera.position).sub(firePosition).normalize();
                    _raycaster.set(firePosition, rayDirection);
                    const obstacles = [...walls, ...enemies.filter(e => e !== enemy)]; // 壁と自分以外の敵を障害物リストに
                    const intersects = _raycaster.intersectObjects(obstacles, true); // trueでグループ内のメッシュも判定

                    if (intersects.length === 0 || intersects[0].distance > distanceToPlayer) {
                        // 全ての条件を満たしたら発射
                        const enemyBullet = new THREE.Mesh(enemyBulletGeometry, enemyBulletMaterial);
                        enemyBullet.position.copy(firePosition);

                        const targetPosition = _vector2.copy(camera.position);
                        targetPosition.y = playerHeight / 2; // プレイヤーの体の中心を狙う
                        const direction = _vector3.copy(targetPosition).sub(firePosition).normalize();
                        enemyBullet.velocity = direction.clone().multiplyScalar(20 * difficultyMultiplier); // 難易度に応じて弾速を上げる

                        scene.add(enemyBullet);
                        enemyBullets.push(enemyBullet);
                        enemy.lastShotTime = elapsedTime;
                    }
                }
            }
        }
    }

    // 死亡中の敵の処理
    for (let i = dyingEnemies.length - 1; i >= 0; i--) {
        const enemy = dyingEnemies[i];
        
        // 位置と回転を更新
        enemy.position.add(enemy.deathVelocity.clone().multiplyScalar(delta));
        enemy.rotation.x += enemy.deathAngularVelocity.x * delta;
        enemy.rotation.y += enemy.deathAngularVelocity.y * delta;
        enemy.rotation.z += enemy.deathAngularVelocity.z * delta;

        // 重力を適用
        enemy.deathVelocity.y -= 9.8 * delta;

        // バウンディングボックスを計算して、モデルの最も低い点を取得
        _box1.setFromObject(enemy);
        const lowestPoint = _box1.min.y;

        // 地面との衝突判定と物理挙動の調整
        if (lowestPoint < 0) {
            // 地面に接触した瞬間に消す
            scene.remove(enemy);
            dyingEnemies.splice(i, 1);
            // 敵の数を維持するため新しい敵を追加
            if (enemies.length < 8) {
                spawnEnemy();
            }
            continue; // 次の敵の処理へ
        }

        // 5秒後に消去
        if (elapsedTime - enemy.deathTime > 5) {
            scene.remove(enemy);
            dyingEnemies.splice(i, 1);
            // 敵の数を維持するため新しい敵を追加
            if (enemies.length < 8) {
                spawnEnemy();
            }
        }
    }

    // 敵の弾の処理
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        bullet.position.add(bullet.velocity.clone().multiplyScalar(delta));

        let bulletRemoved = false;

        // プレイヤーとの衝突判定
        _box1.setFromObject(bullet);
        if (_box1.intersectsBox(playerBox)) {
            takeDamage(5); // 敵の弾に当たると5ダメージ
            scene.remove(bullet);
            enemyBullets.splice(i, 1);
            bulletRemoved = true;
            continue;
        }

        // 壁との衝突判定
        for (const wall of walls) {
            _box2.setFromObject(wall);
            if (_box1.intersectsBox(_box2)) {
                scene.remove(bullet);
                enemyBullets.splice(i, 1);
                bulletRemoved = true;
                break;
            }
        }
        if (bulletRemoved) continue;

        // 画面外に出たら削除
        if (bullet.position.y < -10 || bullet.position.y > 50 || Math.abs(bullet.position.x) > 50 || Math.abs(bullet.position.z) > 50) {
            scene.remove(bullet);
            enemyBullets.splice(i, 1);
        }
    }

    renderer.render(scene, camera);

    // アイテムの処理
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.rotation.y += 0.01;

        _box1.setFromObject(item);
        if (_box1.intersectsBox(playerBox)) {
            if (item.itemType === 'speed') {
                speedUpActive = true;
                speedUpTimer = 5; // 5秒間
            } else if (item.itemType === 'rapid') {
                rapidFireActive = true;
                rapidFireTimer = 5; // 5秒間
            }
            scene.remove(item);
            items.splice(i, 1);
        }
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

animate();
