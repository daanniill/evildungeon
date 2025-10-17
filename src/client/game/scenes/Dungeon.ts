import * as Phaser from 'phaser';

type GridCell = 0 | 1; // 0 = empty, 1 = platform block

interface Enemy {
  sprite: Phaser.Physics.Arcade.Image;
  health: number;
  maxHealth: number;
}

interface Boss {
  sprite: Phaser.Physics.Arcade.Image;
  health: number;
  maxHealth: number;
  isActive: boolean;
}

export class Dungeon extends Phaser.Scene {
  private grid: GridCell[][] = [];
  private readonly cols = 80;
  private readonly rows = 36;
  private readonly tileSize = 20;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies: Enemy[] = [];
  private boss!: Boss;
  private background!: Phaser.GameObjects.TileSprite;

  // UI Elements
  private healthText!: Phaser.GameObjects.Text;
  private enemyCountText!: Phaser.GameObjects.Text;
  private bossHealthText!: Phaser.GameObjects.Text;
  private attackCooldownText!: Phaser.GameObjects.Text;

  // Game state
  private playerHealth = 3;
  private playerMaxHealth = 3;
  private attackCooldown = 0;
  private attackRange = 60;
  private lastHitTime = 0;
  private gameWon = false;

  // Movement
  private moveSpeed = 220;
  private jumpSpeed = 430;
  private dashSpeed = 520;
  private canDash = true;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0e0e16);

    // Background
    this.background = this.add.tileSprite(0, 0, this.cols * this.tileSize, this.rows * this.tileSize, 'dungeon_background');
    this.background.setOrigin(0, 0);
    this.background.setDepth(-10);

    this.generatePlatforms();
    this.renderPlatforms();

    // Player (knight sprite)
    const spawn = this.findValidSpawn();
    this.player = this.physics.add
      .sprite(spawn.x, spawn.y, 'knight')
      .setDisplaySize(this.tileSize * 1.2, this.tileSize * 1.6)
      .setCollideWorldBounds(true);
    
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(this.tileSize * 0.8, this.tileSize * 0.8);
    (this.player.body as Phaser.Physics.Arcade.Body).setOffset(this.tileSize * 0.2, this.tileSize * 0.8);

    // Collisions
    this.platforms = this.physics.add.staticGroup();
    this.buildPhysicsPlatforms();
    this.physics.add.collider(this.player, this.platforms);

    // Enemies
    this.spawnEnemies(8);
    this.enemies.forEach(enemy => {
      this.physics.add.collider(enemy.sprite, this.platforms);
      this.physics.add.collider(enemy.sprite, this.player);
    });

    // Enemy-to-enemy collisions
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const enemy1 = this.enemies[i];
        const enemy2 = this.enemies[j];
        if (enemy1 && enemy2) {
          this.physics.add.collider(enemy1.sprite, enemy2.sprite);
        }
      }
    }

    // Boss at the end
    this.spawnBoss();
    this.physics.add.collider(this.boss.sprite, this.player);
    this.enemies.forEach(enemy => {
      this.physics.add.collider(this.boss.sprite, enemy.sprite);
    });

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // UI
    this.createUI();

    // Camera follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    const worldWidth = this.cols * this.tileSize;
    const worldHeight = this.rows * this.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
  }

  override update(_: number, delta: number): void {
    if (!this.player || this.gameWon) return;

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    // Update UI
    this.updateUI();

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
      this.canDash = true;
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

    // Attack (X key)
    const attackKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    if (Phaser.Input.Keyboard.JustDown(attackKey) && this.attackCooldown <= 0) {
      this.performAttack();
      this.attackCooldown = 500; // 500ms cooldown
    }

    // Check enemy collisions for damage (using overlap instead of collision)
    this.checkEnemyCollisions();

    // Check boss collision (using overlap instead of collision)
    this.checkBossCollision();

    // Check win condition
    if (this.boss.health <= 0 && !this.gameWon) {
      this.gameWon = true;
      this.showVictoryScreen();
    }

    // Check game over
    if (this.playerHealth <= 0) {
      this.scene.start('GameOver');
    }
  }

  private generatePlatforms(): void {
    this.grid = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => 0));
    
    // Ground line
    for (let x = 0; x < this.cols; x++) this.grid[this.rows - 2]![x] = 1;
    
    // Random platform shelves
    for (let i = 0; i < 40; i++) {
      const w = Phaser.Math.Between(3, 12);
      const x0 = Phaser.Math.Between(1, this.cols - w - 1);
      const y = Phaser.Math.Between(6, this.rows - 6);
      const row = this.grid[y]!;
      for (let x = 0; x < w; x++) row[x0 + x] = 1;
    }

    // Create a path to the boss area (right side)
    for (let x = this.cols - 20; x < this.cols - 5; x++) {
      this.grid[this.rows - 8]![x] = 1;
    }
  }

  private renderPlatforms(): void {
    for (let y = 0; y < this.rows; y++) {
      const row = this.grid[y]!;
      for (let x = 0; x < this.cols; x++) {
        const isBlock = row[x] === 1;
        if (isBlock) {
          // Create textured platform blocks using stone.png
          const block = this.add.image(
            x * this.tileSize + this.tileSize / 2,
            y * this.tileSize + this.tileSize / 2,
            'stone'
          );
          block.setDisplaySize(this.tileSize + 1, this.tileSize + 1);
          block.setDepth(1);
        }
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
            'stone'
          );
          block.setDisplaySize(this.tileSize + 1, this.tileSize + 1);
          block.setVisible(false); // Hide the physics body visual
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
      const cx = Phaser.Math.Between(2, this.cols - 25); // Keep enemies away from boss area
      const cy = Phaser.Math.Between(2, this.rows - 6);
      const row = this.grid[cy]!;
      const rowBelow = this.grid[cy + 1]!;
      if (rowBelow[cx] !== 1 || row[cx] !== 0) continue;
      
      const enemySprite = this.physics.add.image(
        cx * this.tileSize + this.tileSize / 2,
        cy * this.tileSize,
        'mob'
      );
      enemySprite.setDisplaySize(this.tileSize * 1.3, this.tileSize * 1.3);
      enemySprite.setBounce(0.1).setCollideWorldBounds(true);
      enemySprite.setVelocityX(Phaser.Math.Between(-80, 80));

      this.enemies.push({
        sprite: enemySprite,
        health: 2,
        maxHealth: 2
      });
    }
  }

  private spawnBoss(): void {
    const bossX = (this.cols - 3) * this.tileSize + this.tileSize / 2;
    const bossY = (this.rows - 9) * this.tileSize;
    
    const bossSprite = this.physics.add.image(bossX, bossY, 'boss');
    bossSprite.setDisplaySize(this.tileSize * 2.2, this.tileSize * 2.2);
    bossSprite.setCollideWorldBounds(true);
    
    this.physics.add.collider(bossSprite, this.platforms);

    this.boss = {
      sprite: bossSprite,
      health: 10,
      maxHealth: 10,
      isActive: true
    };
  }

  private createUI(): void {
    this.healthText = this.add
      .text(12, 12, `Health: ${this.playerHealth}/${this.playerMaxHealth}`, {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#00ff00',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.enemyCountText = this.add
      .text(12, 36, `Enemies: ${this.enemies.length}`, {
        fontFamily: 'Arial Black',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.bossHealthText = this.add
      .text(12, 60, `Boss: ${this.boss.health}/${this.boss.maxHealth}`, {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.attackCooldownText = this.add
      .text(12, 84, 'X to Attack', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Instructions
    this.add
      .text(12, this.scale.height - 60, 'Arrows/WASD: Move | Space/Up: Jump | Shift: Dash | X: Attack', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);
  }

  private updateUI(): void {
    this.healthText.setText(`Health: ${this.playerHealth}/${this.playerMaxHealth}`);
    this.enemyCountText.setText(`Enemies: ${this.enemies.filter(e => e.health > 0).length}`);
    this.bossHealthText.setText(`Boss: ${this.boss.health}/${this.boss.maxHealth}`);
    
    if (this.attackCooldown > 0) {
      this.attackCooldownText.setText(`Attack: ${Math.ceil(this.attackCooldown / 100)}s`);
      this.attackCooldownText.setColor('#ff6666');
    } else {
      this.attackCooldownText.setText('X to Attack');
      this.attackCooldownText.setColor('#ffff00');
    }
  }

  private performAttack(): void {
    const attackX = this.player.x + (this.player.flipX ? -this.attackRange : this.attackRange);
    const attackY = this.player.y;

    // Visual attack effect
    const attackEffect = this.add.circle(attackX, attackY, this.attackRange / 2, 0xffff00, 0.3);
    attackEffect.setDepth(5);
    this.tweens.add({
      targets: attackEffect,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 200,
      onComplete: () => attackEffect.destroy()
    });

    // Check enemy hits
    this.enemies.forEach(enemy => {
      if (enemy.health > 0) {
        const dist = Phaser.Math.Distance.Between(attackX, attackY, enemy.sprite.x, enemy.sprite.y);
        if (dist < this.attackRange) {
          this.damageEnemy(enemy);
        }
      }
    });

    // Check boss hit
    if (this.boss.health > 0) {
      const dist = Phaser.Math.Distance.Between(attackX, attackY, this.boss.sprite.x, this.boss.sprite.y);
      if (dist < this.attackRange) {
        this.damageBoss();
      }
    }
  }

  private damageEnemy(enemy: Enemy): void {
    enemy.health--;
    enemy.sprite.setTint(0xffcdd2);
    
    if (enemy.health <= 0) {
      enemy.sprite.destroy();
    } else {
      // Knockback effect
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
      enemy.sprite.x += Math.cos(angle) * 20;
      enemy.sprite.y += Math.sin(angle) * 20;
      // Reset tint after a short delay
      this.time.delayedCall(200, () => {
        if (enemy.sprite.active) {
          enemy.sprite.clearTint();
        }
      });
    }
  }

  private damageBoss(): void {
    this.boss.health--;
    this.boss.sprite.setTint(0xff6666);
    
    if (this.boss.health <= 0) {
      this.boss.sprite.destroy();
    } else {
      // Boss knockback
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.sprite.x, this.boss.sprite.y);
      this.boss.sprite.x += Math.cos(angle) * 15;
      this.boss.sprite.y += Math.sin(angle) * 15;
      // Reset tint after a short delay
      this.time.delayedCall(200, () => {
        if (this.boss.sprite.active) {
          this.boss.sprite.clearTint();
        }
      });
    }
  }

  private checkEnemyCollisions(): void {
    const now = this.time.now;
    if (now - this.lastHitTime < 1000) return; // 1 second invincibility

    this.enemies.forEach(enemy => {
      if (enemy.health > 0) {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
        if (dist < this.tileSize * 1.0) {
          this.takeDamage();
          this.lastHitTime = now;
        }
      }
    });
  }

  private checkBossCollision(): void {
    if (this.boss.health <= 0) return;
    
    const now = this.time.now;
    if (now - this.lastHitTime < 1000) return;

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.sprite.x, this.boss.sprite.y);
    if (dist < this.tileSize * 1.6) {
      this.takeDamage();
      this.lastHitTime = now;
    }
  }

  private takeDamage(): void {
    this.playerHealth--;
    
    // Flash effect
    this.player.setTint(0xff0000);
    this.time.delayedCall(200, () => {
      this.player.clearTint();
    });
  }

  private showVictoryScreen(): void {
    const victoryText = this.add
      .text(this.cameras.main.centerX, this.cameras.main.centerY, 'VICTORY!', {
        fontFamily: 'Arial Black',
        fontSize: '64px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 8,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.tweens.add({
      targets: victoryText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1000,
      yoyo: true,
      repeat: -1
    });

    this.time.delayedCall(3000, () => {
      this.scene.start('StartScreen');
    });
  }
}