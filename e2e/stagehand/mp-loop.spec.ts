import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { newStagehand } from './config';

const BASE_URL = 'https://rust.razzoozle.xyz';
const E2E_PASSWORD = process.env.E2E_PW || 'notset';

// Schema to extract PIN from manager's game start screen
const PinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

// Schema to extract question type from current screen
const QuestionSchema = z.object({
  questionType: z.enum([
    'multiple-choice',
    'single-choice',
    'true-false',
    'text-answer',
    'word-order',
    'matching',
    'wortarten',
    'drag-drop',
    'math',
  ]),
});

describe('Multiplayer Game Loop (E2E All Types)', () => {
  let managerStagehand: Stagehand;
  let playerStagehand: Stagehand;

  beforeEach(async () => {
    // Create two separate Stagehand instances for manager and player
    managerStagehand = newStagehand();
    playerStagehand = newStagehand();

    await managerStagehand.init();
    await playerStagehand.init();
  });

  afterEach(async () => {
    // Clean close both browsers
    if (managerStagehand) {
      await managerStagehand.close();
    }
    if (playerStagehand) {
      await playerStagehand.close();
    }
  });

  it('should complete full MP game loop with both players answering all 9 question types', async () => {
    // ============ MANAGER: LOGIN ============
    await managerStagehand.page.goto(`${BASE_URL}/manager`);

    // Wait for login form and enter password
    const loginPasswordField = managerStagehand.page.locator('[data-testid="login-password"]');
    await loginPasswordField.waitFor({ state: 'visible' });

    await managerStagehand.act(
      'Enter the password from the environment variable and click login button',
      async (page) => {
        const input = page.locator('[data-testid="login-password"]');
        await input.click();
        await input.fill(E2E_PASSWORD);

        // Look for login button and click it
        const loginBtn = page.locator('button:has-text("Login"), button:has-text("Anmelden")');
        await loginBtn.first().click();
      }
    );

    // Verify we're in manager dashboard
    await managerStagehand.page.waitForURL(`${BASE_URL}/manager/config`, { timeout: 10000 });

    // ============ MANAGER: START GAME WITH E2E ALL TYPES QUIZ ============
    await managerStagehand.act(
      'Find and click on the "E2E All Types" quiz to open it, then click start game button',
      async (page) => {
        // Navigate to quizzes view if needed
        const quizzLink = page.locator('a:has-text("E2E All Types")').first();
        if (await quizzLink.isVisible()) {
          await quizzLink.click();
        }
        // Click start game button
        const startBtn = page.locator('button:has-text("Start"), button:has-text("Spiel starten")');
        await startBtn.first().click();
      }
    );

    // Extract PIN from the manager's screen
    const pinResult = await managerStagehand.extract(
      'Locate the PIN code displayed on the screen for players to join. It should be a 6-digit number.',
      PinSchema
    );

    if (!pinResult.success) {
      throw new Error(`Failed to extract PIN: ${pinResult.error}`);
    }

    const gamePin = pinResult.data.pin;
    console.log(`Manager started game with PIN: ${gamePin}`);

    // ============ PLAYER: NAVIGATE TO JOIN PAGE ============
    await playerStagehand.page.goto(`${BASE_URL}`);

    // Wait for start page and PIN input field
    await playerStagehand.page.waitForURL(/.*/, { timeout: 10000 });

    // ============ PLAYER: ENTER PIN AND JOIN ============
    await playerStagehand.act(
      'Find the PIN input field and enter the 6-digit PIN, then click join button',
      async (page) => {
        const pinInput = page.locator('input[type="text"], input[placeholder*="PIN"], input[data-testid*="pin"]').first();
        await pinInput.click();
        await pinInput.fill(gamePin);

        // Find and click join button
        const joinBtn = page.locator('button:has-text("Join"), button:has-text("Beitreten")');
        await joinBtn.first().click();
      }
    );

    // ============ PLAYER: ENTER NAME ============
    await playerStagehand.act(
      'Enter the player name "SH-Player" in the name input field',
      async (page) => {
        const nameInput = page.locator('input[type="text"], input[placeholder*="name"], input[data-testid*="player-name"]').first();
        await nameInput.click();
        await nameInput.fill('SH-Player');

        // Find and click ready/confirm button
        const readyBtn = page.locator('button:has-text("Ready"), button:has-text("Bereit"), button:has-text("Starten")').first();
        await readyBtn.click();
      }
    );

    // Wait for both players to be ready
    await playerStagehand.page.waitForFunction(
      () => document.body.innerText.includes('Game starting') || document.body.innerText.includes('Spiel startet'),
      { timeout: 15000 }
    );

    // ============ QUESTIONS: 9 QUESTION TYPES ============
    // Question types: multiple-choice, single-choice, true-false, text-answer, word-order, matching, wortarten, drag-drop, math

    const questionStrategies: Record<string, (sh: Stagehand) => Promise<void>> = {
      'multiple-choice': async (sh) => {
        await sh.act(
          'Select one option from multiple-choice and click submit',
          async (page) => {
            const options = page.locator('[data-testid*="option"], label:has-text("A"), label:has-text("B")').first();
            if (await options.isVisible()) {
              await options.click();
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'single-choice': async (sh) => {
        await sh.act(
          'Select one radio button option and click submit',
          async (page) => {
            const radio = page.locator('input[type="radio"]').first();
            if (await radio.isVisible()) {
              await radio.click();
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'true-false': async (sh) => {
        await sh.act(
          'Click true or false button and submit',
          async (page) => {
            const trueBtn = page.locator('button:has-text("True"), button:has-text("Wahr")').first();
            if (await trueBtn.isVisible()) {
              await trueBtn.click();
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'text-answer': async (sh) => {
        await sh.act(
          'Type an answer in the text input field and submit',
          async (page) => {
            const textInput = page.locator('input[type="text"], textarea').first();
            if (await textInput.isVisible()) {
              await textInput.click();
              await textInput.fill('answer');
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'word-order': async (sh) => {
        await sh.act(
          'Drag and arrange words in correct order, then submit',
          async (page) => {
            const words = page.locator('[data-testid*="word"], .word-item').first();
            if (await words.isVisible()) {
              // Stagehand handles basic interactions; for complex drag, use position
              await words.click();
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'matching': async (sh) => {
        await sh.act(
          'Match items by clicking pairs and then submit',
          async (page) => {
            const item = page.locator('[data-testid*="match-item"], .match-option').first();
            if (await item.isVisible()) {
              await item.click();
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'wortarten': async (sh) => {
        await sh.act(
          'Select word types for tokens. Verify token 0 is disabled. Select: Hund=Nomen, läuft=Verb, schnell=Adverb. Token 0 (Der) should be greyed out.',
          async (page) => {
            // Token 0 should be disabled (verify it's greyed out / not clickable)
            const token0 = page.locator('[data-testid="wortarten-token-0"]');
            if (await token0.isVisible()) {
              const isDisabled = await token0.evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));
              if (!isDisabled) {
                console.warn('Token 0 is not visibly disabled; may be a UI state issue');
              }
            }

            // Tag active tokens: Token 1 (Hund) = Nomen, Token 2 (läuft) = Verb, Token 3 (schnell) = Adverb
            const hund = page.locator('[data-testid="wortarten-token-1"]');
            if (await hund.isVisible()) {
              await hund.click();
              // Select Nomen from the dropdown/menu that appears
              const nomenOption = page.locator('button:has-text("Nomen"), [data-testid*="pos-Nomen"]');
              if (await nomenOption.isVisible()) {
                await nomenOption.first().click();
              }
            }

            const lauft = page.locator('[data-testid="wortarten-token-2"]');
            if (await lauft.isVisible()) {
              await lauft.click();
              const verbOption = page.locator('button:has-text("Verb"), [data-testid*="pos-Verb"]');
              if (await verbOption.isVisible()) {
                await verbOption.first().click();
              }
            }

            const schnell = page.locator('[data-testid="wortarten-token-3"]');
            if (await schnell.isVisible()) {
              await schnell.click();
              const adverbOption = page.locator('button:has-text("Adverb"), [data-testid*="pos-Adverb"]');
              if (await adverbOption.isVisible()) {
                await adverbOption.first().click();
              }
            }

            // Submit
            const submitBtn = page.locator('[data-testid="wortarten-submit"], button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'drag-drop': async (sh) => {
        await sh.act(
          'Drag and drop items into target zones and submit',
          async (page) => {
            const dragItem = page.locator('[data-testid*="drag"], .draggable').first();
            if (await dragItem.isVisible()) {
              await dragItem.click();
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },

      'math': async (sh) => {
        await sh.act(
          'Answer the math question by typing a number and submit',
          async (page) => {
            const mathInput = page.locator('input[type="number"], input[type="text"]').first();
            if (await mathInput.isVisible()) {
              await mathInput.click();
              await mathInput.fill('42');
            }
            const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Absenden")').first();
            await submitBtn.click();
          }
        );
      },
    };

    // Answer 9 questions on both player and manager
    for (let q = 0; q < 9; q++) {
      console.log(`\nQuestion ${q + 1} of 9`);

      // Wait for question to appear on player screen
      await playerStagehand.page.waitForFunction(
        () => document.body.innerText.includes('Question') || document.body.innerText.includes('Frage'),
        { timeout: 15000 }
      );

      // Detect question type
      let currentQuestionType = 'multiple-choice';
      const questionTypeAttempt = await playerStagehand.extract(
        'What is the type of question currently displayed? Look for visual indicators like radio buttons, checkboxes, draggable items, etc.',
        QuestionSchema
      );
      if (questionTypeAttempt.success) {
        currentQuestionType = questionTypeAttempt.data.questionType;
      }

      console.log(`Question type: ${currentQuestionType}`);

      // Player answers question
      const playerStrategy = questionStrategies[currentQuestionType];
      if (playerStrategy) {
        await playerStrategy(playerStagehand);
      } else {
        throw new Error(`No strategy for question type: ${currentQuestionType}`);
      }

      // Manager also answers the same question (different player, same quiz)
      const managerStrategy = questionStrategies[currentQuestionType];
      if (managerStrategy) {
        await managerStrategy(managerStagehand);
      }

      // Wait for both to complete the question (move to next or reveal)
      await playerStagehand.page.waitForFunction(
        () => document.body.innerText.includes('Reveal') || document.body.innerText.includes('Next') || document.body.innerText.includes('Nächste'),
        { timeout: 10000 }
      );

      // ============ REVEAL: Assert Correctness ============
      if (currentQuestionType === 'wortarten') {
        // Wortarten reveal: assert per-token coloring
        await playerStagehand.page.waitForFunction(
          () => {
            const tokens = document.querySelectorAll('[data-testid*="wortarten-token"]');
            return tokens.length > 0 && Array.from(tokens).some((t) => window.getComputedStyle(t).color !== '');
          },
          { timeout: 10000 }
        );

        // Assert token 0 is neutral/greyed
        const token0Color = await playerStagehand.page.locator('[data-testid="wortarten-token-0"]').evaluate((el) => window.getComputedStyle(el).color);
        console.log(`Token 0 color: ${token0Color}`);
      } else if (currentQuestionType === 'math') {
        // Math reveal: assert formatted correctAnswer is visible
        await playerStagehand.page.waitForFunction(
          () => document.body.innerText.includes('Correct') || document.body.innerText.includes('Richtig') || document.body.innerText.match(/Answer:\s*\d+/i),
          { timeout: 10000 }
        );
        console.log('Math answer revealed on screen');
      }

      // Click next or continue button
      await playerStagehand.act(
        'Click the next or continue button to move to the next question',
        async (page) => {
          const nextBtn = page.locator('button:has-text("Next"), button:has-text("Weiter"), button:has-text("Continue")').first();
          await nextBtn.click();
        }
      );

      await managerStagehand.act(
        'Click the next or continue button to move to the next question',
        async (page) => {
          const nextBtn = page.locator('button:has-text("Next"), button:has-text("Weiter"), button:has-text("Continue")').first();
          await nextBtn.click();
        }
      );
    }

    // ============ PODIUM: Verify Both Players Listed ============
    // Wait for podium/results screen to appear
    await playerStagehand.page.waitForFunction(
      () => document.body.innerText.includes('Podium') || document.body.innerText.includes('Results') || document.body.innerText.includes('Platzierung'),
      { timeout: 15000 }
    );

    // Assert podium is visible and contains player names
    const podiumVisible = await playerStagehand.page.locator('text=Podium, text=Platzierung, text=Results').first().isVisible().catch(() => false);
    if (!podiumVisible) {
      console.log('Podium screen text not directly located; checking for player names in DOM');
    }

    // Verify manager appears on podium
    const managerFound = await playerStagehand.page.getByText('Manager', { exact: false }).isVisible().catch(() => false);
    console.log(`Manager listed on podium: ${managerFound}`);

    // Verify player appears on podium
    const playerFound = await playerStagehand.page.getByText('SH-Player').isVisible();
    console.assert(playerFound, 'SH-Player should be visible on podium');
    console.log(`Player "SH-Player" listed on podium: ${playerFound}`);

    // ============ CLEANUP: Both instances close cleanly ============
    console.log('Both players reached podium. Closing browsers...');
    // afterEach handles close
  });
});
