// シーン、カメラ、レンダラーの初期化
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 照明
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(10, 20, 5);
scene.add(directionalLight);

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
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(testPosition.x, playerHeight / 2, testPosition.z),
        new THREE.Vector3(playerWidth, playerHeight, playerWidth)
    );

    for (const wall of walls) {
        const wallBox = new THREE.Box3().setFromObject(wall);
        if (playerBox.intersectsBox(wallBox)) {
            return wall;
        }
    }
    return null;
}

// 敵
const enemies = [];
const enemyGeometry = new THREE.BoxGeometry(1, 2, 1);
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });

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
    const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
    while (true) {
        let collision = false;
        const x = Math.random() * 48 - 24;
        const z = Math.random() * 48 - 24;
        enemy.position.set(x, 1, z);

        // プレイヤーからの距離が近すぎないかチェック
        const distanceToPlayer = enemy.position.distanceTo(camera.position);
        if (distanceToPlayer < 10) { // 10単位以内にはスポーンさせない
            collision = true;
        }

        // 視界内かどうかのチェック（簡易的なもの）
        // プレイヤーのカメラの向きと敵の方向ベクトルの内積を計算
        const enemyDirection = enemy.position.clone().sub(camera.position).normalize();
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const dotProduct = cameraDirection.dot(enemyDirection);

        // dotProductが正の値で、かつある閾値以上であれば視界内とみなす
        // ここでは0.5を閾値として、約60度（cos(60度) = 0.5）の視野角を想定
        if (dotProduct > 0.5) {
            collision = true; // 視界内にはスポーンさせない
        }

        const enemyBox = new THREE.Box3().setFromObject(enemy);
        for (const wall of walls) {
            const wallBox = new THREE.Box3().setFromObject(wall);
            if (enemyBox.intersectsBox(wallBox)) {
                collision = true;
                break;
            }
        }
        if (!collision) break;
    }
    scene.add(enemy);
    enemies.push(enemy);
}

for (let i = 0; i < 10; i++) {
    spawnEnemy();
}

// 弾
const bullets = [];
const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
let isFiring = false;
let lastFireTime = 0;
const fireRate = 0.5;

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

    const oldPosition = camera.position.clone();
    const moveDirection = new THREE.Vector3();
    
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    if (moveForward) moveDirection.add(forward);
    if (moveBackward) moveDirection.sub(forward);
    if (moveRight) moveDirection.add(right);
    if (moveLeft) moveDirection.sub(right);

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        const moveStep = moveDirection.multiplyScalar(moveSpeed * delta);

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

    if (isFiring && (elapsedTime - lastFireTime > fireRate)) {
        fireBullet();
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.position.add(bullet.velocity.clone().multiplyScalar(delta));

        let bulletRemoved = false;

        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (bullet.position.distanceTo(enemy.position) < 1) {
                spawnCoins(enemy.position.clone());
                scene.remove(bullet);
                bullets.splice(i, 1);
                scene.remove(enemy);
                enemies.splice(j, 1);
                spawnEnemy();
                bulletRemoved = true;
                break;
            }
        }
        if (bulletRemoved) continue;

        const bulletBox = new THREE.Box3().setFromCenterAndSize(bullet.position, new THREE.Vector3(0.2, 0.2, 0.2));
        for (const wall of walls) {
            const wallBox = new THREE.Box3().setFromObject(wall);
            if (bulletBox.intersectsBox(wallBox)) {
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

    for (const enemy of enemies) {
        const oldEnemyPos = enemy.position.clone();
        enemy.lookAt(camera.position);
        const speed = 1.5 * delta;
        enemy.translateZ(speed);

        const enemyBox = new THREE.Box3().setFromObject(enemy);
        let collision = false;
        for (const wall of walls) {
            const wallBox = new THREE.Box3().setFromObject(wall);
            if (enemyBox.intersectsBox(wallBox)) {
                collision = true;
                break;
            }
        }
        if (collision) {
            enemy.position.copy(oldEnemyPos);
        }

        // 敵とプレイヤーの衝突判定
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(camera.position.x, playerHeight / 2, camera.position.z),
            new THREE.Vector3(playerWidth, playerHeight, playerWidth)
        );
        if (enemyBox.intersectsBox(playerBox)) {
            takeDamage(10); // 敵に接触すると10ダメージ
        }
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

animate();
