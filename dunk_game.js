// Three.js 초기화
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 하늘색 배경
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// Cannon.js 물리 엔진 초기화
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// 게임 설정
const gameSettings = {
    playerSpeed: 0.2,
    jumpForce: 5,
    dunkForce: 15,
    hoopHeight: 3.05, // NBA 규격 골대 높이
    courtSize: 28.65, // NBA 규격 코트 크기
    ballSize: 0.24, // NBA 규격 공 크기
    comboTime: 3000 // 콤보 유지 시간 (ms)
};

// 게임 상태
const gameState = {
    isPlaying: false,
    score: 0,
    combo: 0,
    lastDunkTime: 0
};

// 플레이어 설정
const player = {
    mesh: null,
    body: null,
    isJumping: false,
    isDunking: false
};

// 공 설정
const ball = {
    mesh: null,
    body: null,
    isHeld: true
};

// 키 입력 상태
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

// 마우스 조작
let mouseX = 0;
let mouseY = 0;
document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

// 코트 생성
function createCourt() {
    // 바닥
    const floorGeometry = new THREE.PlaneGeometry(gameSettings.courtSize, gameSettings.courtSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a3b8c,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 바닥 물리 바디
    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({ mass: 0 });
    floorBody.addShape(floorShape);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floorBody);

    // 코트 라인
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array([
        -gameSettings.courtSize/2, 0.01, 0,
        gameSettings.courtSize/2, 0.01, 0,
        0, 0.01, -gameSettings.courtSize/2,
        0, 0.01, gameSettings.courtSize/2
    ]);
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);
}

// 골대 생성
function createHoop() {
    // 백보드
    const backboardGeometry = new THREE.BoxGeometry(1.83, 1.22, 0.05);
    const backboardMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.5
    });
    const backboard = new THREE.Mesh(backboardGeometry, backboardMaterial);
    backboard.position.set(0, gameSettings.hoopHeight, -gameSettings.courtSize/2 + 0.5);
    backboard.castShadow = true;
    scene.add(backboard);

    // 링
    const ringGeometry = new THREE.TorusGeometry(0.23, 0.02, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        roughness: 0.3,
        metalness: 0.7
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, gameSettings.hoopHeight - 0.3, -gameSettings.courtSize/2 + 0.5);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    scene.add(ring);
}

// 플레이어 생성
function createPlayer() {
    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00,
        roughness: 0.5,
        metalness: 0.5,
        emissive: 0x00ff00,
        emissiveIntensity: 0.2
    });
    player.mesh = new THREE.Mesh(geometry, material);
    player.mesh.position.set(0, 0.9, 0);
    player.mesh.castShadow = true;
    player.mesh.receiveShadow = true;
    scene.add(player.mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.9, 0.25));
    player.body = new CANNON.Body({ mass: 80 });
    player.body.addShape(shape);
    player.body.position.set(0, 0.9, 0);
    world.addBody(player.body);
}

// 공 생성
function createBall() {
    const geometry = new THREE.SphereGeometry(gameSettings.ballSize, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff9900,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0xff9900,
        emissiveIntensity: 0.2
    });
    ball.mesh = new THREE.Mesh(geometry, material);
    ball.mesh.position.set(0, 1.5, 0);
    ball.mesh.castShadow = true;
    ball.mesh.receiveShadow = true;
    scene.add(ball.mesh);

    const shape = new CANNON.Sphere(gameSettings.ballSize);
    ball.body = new CANNON.Body({ mass: 0.6 });
    ball.body.addShape(shape);
    ball.body.position.set(0, 1.5, 0);
    world.addBody(ball.body);
}

// 조명 설정
function setupLights() {
    // 주변광
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // 직사광
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // 헤드라이트
    const headlight = new THREE.SpotLight(0xffffff, 1.0);
    headlight.position.set(0, 5, 10);
    headlight.target.position.set(0, 0, 0);
    headlight.angle = Math.PI / 4;
    headlight.penumbra = 0.5;
    headlight.decay = 2;
    headlight.distance = 50;
    scene.add(headlight);
    scene.add(headlight.target);
}

// 게임 초기화
function init() {
    createCourt();
    createHoop();
    createPlayer();
    createBall();
    setupLights();

    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    // 시작 화면 이벤트 리스너
    document.getElementById('startButton').addEventListener('click', () => {
        document.getElementById('startScreen').style.display = 'none';
        gameState.isPlaying = true;
    });
}

// 플레이어 이동
function movePlayer() {
    if (!gameState.isPlaying) return;

    const moveSpeed = player.isJumping ? gameSettings.playerSpeed * 0.8 : gameSettings.playerSpeed;

    if (keys['w'] || keys['ArrowUp']) {
        player.body.position.z -= moveSpeed;
    }
    if (keys['s'] || keys['ArrowDown']) {
        player.body.position.z += moveSpeed;
    }
    if (keys['a'] || keys['ArrowLeft']) {
        player.body.position.x -= moveSpeed;
    }
    if (keys['d'] || keys['ArrowRight']) {
        player.body.position.x += moveSpeed;
    }

    // 점프
    if ((keys[' '] || keys['Space']) && !player.isJumping) {
        player.body.velocity.y = gameSettings.jumpForce;
        player.isJumping = true;
    }

    // 덩크
    if (keys[' '] && player.isJumping && !player.isDunking) {
        player.isDunking = true;
        const powerBar = document.getElementById('powerFill');
        let power = 0;
        const interval = setInterval(() => {
            power += 1;
            powerBar.style.width = `${power}%`;
            if (power >= 100) {
                clearInterval(interval);
                performDunk(power);
                powerBar.style.width = '0%';
            }
        }, 10);

        document.addEventListener('keyup', function onKeyUp(e) {
            if (e.key === ' ' || e.key === 'Space') {
                clearInterval(interval);
                performDunk(power);
                powerBar.style.width = '0%';
                document.removeEventListener('keyup', onKeyUp);
            }
        });
    }
}

// 덩크 수행
function performDunk(power) {
    const dunkForce = gameSettings.dunkForce * (power / 100);
    player.body.velocity.y = dunkForce;
    
    // 공 던지기
    if (ball.isHeld) {
        ball.isHeld = false;
        const direction = new THREE.Vector3(0, 1, -1).normalize();
        ball.body.velocity.set(
            direction.x * dunkForce * 0.5,
            direction.y * dunkForce,
            direction.z * dunkForce * 0.5
        );
    }
}

// 충돌 감지
function checkCollisions() {
    // 플레이어와 바닥 충돌 체크
    if (player.body.position.y <= 0.9) {
        player.isJumping = false;
        player.isDunking = false;
    }

    // 공과 골대 충돌 체크
    if (!ball.isHeld && ball.body.position.y <= gameSettings.hoopHeight - 0.3) {
        const distanceToHoop = Math.sqrt(
            Math.pow(ball.body.position.x, 2) +
            Math.pow(ball.body.position.z - (-gameSettings.courtSize/2 + 0.5), 2)
        );

        if (distanceToHoop < 0.3) {
            updateScore();
            resetBall();
        }
    }
}

// 점수 업데이트
function updateScore() {
    const currentTime = Date.now();
    if (currentTime - gameState.lastDunkTime < gameSettings.comboTime) {
        gameState.combo++;
        showCombo();
    } else {
        gameState.combo = 1;
    }
    gameState.lastDunkTime = currentTime;
    gameState.score += 10 * gameState.combo;
    document.getElementById('score').textContent = `점수: ${gameState.score}`;
}

// 콤보 표시
function showCombo() {
    if (gameState.combo > 1) {
        const comboElement = document.getElementById('combo');
        comboElement.textContent = `${gameState.combo}X COMBO!`;
        comboElement.style.opacity = 1;
        setTimeout(() => {
            comboElement.style.opacity = 0;
        }, 1000);
    }
}

// 공 리셋
function resetBall() {
    ball.isHeld = true;
    ball.body.position.set(player.body.position.x, 1.5, player.body.position.z);
    ball.body.velocity.set(0, 0, 0);
}

// 애니메이션 루프
function animate() {
    requestAnimationFrame(animate);

    // 물리 시뮬레이션
    world.step(1/60);

    // 플레이어 메시 업데이트
    if (player.mesh && player.body) {
        player.mesh.position.copy(player.body.position);
        player.mesh.quaternion.copy(player.body.quaternion);
    }

    // 공 메시 업데이트
    if (ball.mesh && ball.body) {
        if (ball.isHeld) {
            ball.body.position.set(
                player.body.position.x,
                player.body.position.y + 1,
                player.body.position.z
            );
        }
        ball.mesh.position.copy(ball.body.position);
        ball.mesh.quaternion.copy(ball.body.quaternion);
    }

    // 카메라 업데이트
    if (player.body) {
        camera.position.x = player.body.position.x;
        camera.position.z = player.body.position.z + 10;
        camera.lookAt(player.body.position);
    }

    movePlayer();
    checkCollisions();

    renderer.render(scene, camera);
}

// 창 크기 조정
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 게임 시작
init();
animate(); 