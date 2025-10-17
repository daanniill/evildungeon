import * as Phaser from 'phaser';

type GridCell = 0 | 1; // 0 = empty, 1 = platform block

export class Dungeon extends Phaser.Scene {
  private grid: GridCell[][] = [];
  private readonly cols = 64;
  private readonly rows = 36;
  private readonly tileSize = 20;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies: Phaser.Physics.Arcade.Image[] = [];
  private bossHPText!: Phaser.GameObjects.Text;
  private assistButton!: Phaser.GameObjects.Text;

  private moveSpeed = 220;
  private jumpSpeed = 430;
  private dashSpeed = 520;
  private canDash = true;
  private lastHitTime = 0;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0e0e16);

    this.generatePlatforms();
    this.renderPlatforms();

    // Player (physics sprite)
    const spawn = this.findValidSpawn();
    this.player = this.physics.add
      .sprite(spawn.x, spawn.y, undefined as unknown as string)
      .setDisplaySize(this.tileSize * 0.8, this.tileSize * 1.1)
      .setTint(0x4caf50)
      .setCollideWorldBounds(true);
    // Arcade body defaults
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(this.tileSize * 0.8, this.tileSize * 1.1);
    (this.player.body as Phaser.Physics.Arcade.Body).setOffset(0, 0);

    // Collisions
    this.platforms = this.physics.add.staticGroup();
    this.buildPhysicsPlatforms();
    this.physics.add.collider(this.player, this.platforms);

    // Enemies
    this.spawnEnemies(6);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.hitEnemy(e as Phaser.Physics.Arcade.Image));

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // UI
    void this.add
      .text(12, 12, 'Left/Right to move, Up/Space to jump, Shift to dash', {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.bossHPText = this.add
      .text(12, 36, 'Boss: --/--', {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.assistButton = this.add
      .text(12, 64, 'Assist: Strike Boss', {
        fontFamily: 'Arial Black',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#444444',
        padding: { x: 10, y: 6 } as Phaser.Types.GameObjects.Text.TextPadding,
      })
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.assistButton.setStyle({ backgroundColor: '#555555' }))
      .on('pointerout', () => this.assistButton.setStyle({ backgroundColor: '#444444' }))
      .on('pointerdown', () => void this.assistAttack())
      .setScrollFactor(0)
      .setDepth(100);

    // Fetch initial boss state
    void this.refreshBoss();

    // Camera follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    const worldWidth = this.cols * this.tileSize;
    const worldHeight = this.rows * this.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
  }

  override update(_: number, _delta: number): void {
    if (!this.player) return;

    // Horizontal input
    const keyboard = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    const leftKeyDown = this.cursors.left ? this.cursors.left.isDown : false;
    const rightKeyDown = this.cursors.right ? this.cursors.right.isDown : false;
    const left = leftKeyDown || keyboard.addKey('A').isDown;
    const right = rightKeyDown || keyboard.addKey('D').isDown;

    if (left && !right) {
      this.player.setVelocityX(-this.moveSpeed);
      this.player.setFlipX(true);
    } else if (right && !left) {
      this.player.setVelocityX(this.moveSpeed);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    // Jump
    const onFloor = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    const upKey = this.cursors.up;
    const jumpPressed =
      (upKey ? Phaser.Input.Keyboard.JustDown(upKey) : false) ||
      Phaser.Input.Keyboard.JustDown(keyboard.addKey('W')) ||
      Phaser.Input.Keyboard.JustDown(keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE));
    if (jumpPressed && onFloor) {
      this.player.setVelocityY(-this.jumpSpeed);
      this.canDash = true; // reset dash on landing jump
    }

    // Dash (Shift)
    const dashKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    if (Phaser.Input.Keyboard.JustDown(dashKey) && this.canDash) {
      const dir = this.player.flipX ? -1 : 1;
      this.player.setVelocityX(dir * this.dashSpeed);
      this.canDash = false;
      this.time.delayedCall(150, () => {
        // short dash window
      });
    }
  }

  private generatePlatforms(): void {
    // Start empty
    this.grid = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => 0));
    // Ground line
    for (let x = 0; x < this.cols; x++) this.grid[this.rows - 2]![x] = 1;
    // A few random platform shelves
    for (let i = 0; i < 30; i++) {
      const w = Phaser.Math.Between(3, 10);
      const x0 = Phaser.Math.Between(1, this.cols - w - 1);
      const y = Phaser.Math.Between(6, this.rows - 6);
      const row = this.grid[y]!;
      for (let x = 0; x < w; x++) row[x0 + x] = 1;
    }
  }

  private renderPlatforms(): void {
    for (let y = 0; y < this.rows; y++) {
      const row = this.grid[y]!;
      for (let x = 0; x < this.cols; x++) {
        const isBlock = row[x] === 1;
        const color = isBlock ? 0x1f2833 : 0x0e0e16;
        this.add.rectangle(
          x * this.tileSize + this.tileSize / 2,
          y * this.tileSize + this.tileSize / 2,
          this.tileSize - 1,
          this.tileSize - 1,
          color
        ).setDepth(isBlock ? 1 : 0);
      }
    }
  }

  private buildPhysicsPlatforms(): void {
    for (let y = 0; y < this.rows; y++) {
      const row = this.grid[y]!;
      for (let x = 0; x < this.cols; x++) {
        if (row[x] === 1) {
          const block = this.platforms.create(
            x * this.tileSize + this.tileSize / 2,
            y * this.tileSize + this.tileSize / 2,
            undefined as unknown as string
          );
          block.setDisplaySize(this.tileSize, this.tileSize);
          block.refreshBody();
        }
      }
    }
  }

  private findValidSpawn(): { x: number; y: number } {
    for (let tries = 0; tries < 2000; tries++) {
      const cx = Phaser.Math.Between(1, this.cols - 2);
      const cy = Phaser.Math.Between(1, this.rows - 4);
      const row = this.grid[cy]!;
      const rowBelow = this.grid[cy + 1]!;
      if (row[cx] === 0 && rowBelow[cx] === 1) {
        return { x: cx * this.tileSize + this.tileSize / 2, y: cy * this.tileSize };
      }
    }
    return { x: this.tileSize * 2, y: this.tileSize * 2 };
  }

  private spawnEnemies(count: number): void {
    for (let i = 0; i < count; i++) {
      const cx = Phaser.Math.Between(2, this.cols - 3);
      const cy = Phaser.Math.Between(2, this.rows - 6);
      const row = this.grid[cy]!;
      const rowBelow = this.grid[cy + 1]!;
      if (rowBelow[cx] !== 1 || row[cx] !== 0) continue;
      const enemy = this.physics.add.image(
        cx * this.tileSize + this.tileSize / 2,
        cy * this.tileSize,
        undefined as unknown as string
      );
      enemy.setDisplaySize(this.tileSize * 0.9, this.tileSize * 0.9).setTint(0xe91e63);
      enemy.setBounce(0.1).setCollideWorldBounds(true);
      enemy.setVelocityX(Phaser.Math.Between(-80, 80));
      this.enemies.push(enemy);
    }
  }

  private hitEnemy(enemy: Phaser.Physics.Arcade.Image): void {
    const now = this.time.now;
    if (now - this.lastHitTime < 250) return;
    this.lastHitTime = now;
    enemy.setTint(0xffcdd2);
    enemy.setScale(enemy.scaleX * 0.9, enemy.scaleY * 0.9);
    if (enemy.displayWidth < this.tileSize * 0.4) {
      enemy.destroy();
    }
  }

  private async refreshBoss(): Promise<void> {
    try {
      const res = await fetch('/api/boss/status');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { bossId: string; hp: number; maxHp: number };
      this.bossHPText.setText(`Boss: ${data.hp}/${data.maxHp}`);
    } catch (e) {
      this.bossHPText.setText('Boss: unavailable');
      // eslint-disable-next-line no-console
      console.error('Failed to fetch boss status', e);
    }
  }

  private async assistAttack(): Promise<void> {
    try {
      const res = await fetch('/api/boss/attack', { method: 'POST' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await this.refreshBoss();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Assist attack failed', e);
    }
  }
}


