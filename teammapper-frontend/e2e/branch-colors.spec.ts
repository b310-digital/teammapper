import { test, expect } from '@playwright/test';

test('branch colors are inherited correctly from parent nodes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();

  // Add first child to root
  await page.getByText('Root node').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('First Branch');
  await page.locator('.map').click();

  // Add second child to root
  await page.getByText('Root node').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('Second Branch');
  await page.locator('.map').click();

  // Wait for elements to be visible
  await expect(page.getByText('First Branch')).toBeVisible();
  await expect(page.getByText('Second Branch')).toBeVisible();

  // Small delay to ensure rendering is complete
  await page.waitForTimeout(500);

  // Get all branch paths (these have IDs ending with '_branch')
  const branches = await page.locator('path[id$="_branch"]').all();

  // We should have at least 2 branches for the two first-level nodes
  expect(branches.length).toBeGreaterThanOrEqual(2);

  // Get the colors of the first two branches (first-level nodes)
  const firstBranchColor = await branches[0].evaluate(
    el => window.getComputedStyle(el).fill
  );
  const secondBranchColor = await branches[1].evaluate(
    el => window.getComputedStyle(el).fill
  );

  // Verify that the two first-level branches have different colors
  expect(firstBranchColor).toBeTruthy();
  expect(secondBranchColor).toBeTruthy();
  expect(firstBranchColor).not.toBe(secondBranchColor);

  // Add a child to the first branch
  await page.getByText('First Branch').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('Child of First');
  await page.locator('.map').click();

  // Add a child to the second branch
  await page.getByText('Second Branch').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('Child of Second');
  await page.locator('.map').click();

  // Wait for new elements
  await expect(page.getByText('Child of First')).toBeVisible();
  await expect(page.getByText('Child of Second')).toBeVisible();
  await page.waitForTimeout(500);

  // Get all branches again
  const allBranches = await page.locator('path[id$="_branch"]').all();

  // We should now have 4 branches (2 first-level + 2 second-level)
  expect(allBranches.length).toBe(4);

  // Get the colors of the second-level nodes (they should be the last two added)
  const childOfFirstColor = await allBranches[2].evaluate(
    el => window.getComputedStyle(el).fill
  );
  const childOfSecondColor = await allBranches[3].evaluate(
    el => window.getComputedStyle(el).fill
  );

  // Verify that children inherit their parent's branch color
  expect(childOfFirstColor).toBe(firstBranchColor);
  expect(childOfSecondColor).toBe(secondBranchColor);

  // Add another child to the first branch to verify consistency
  await page.getByText('First Branch').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('Another Child of First');
  await page.locator('.map').click();

  await expect(page.getByText('Another Child of First')).toBeVisible();
  await page.waitForTimeout(500);

  const finalBranches = await page.locator('path[id$="_branch"]').all();
  expect(finalBranches.length).toBe(5);

  const anotherChildColor = await finalBranches[4].evaluate(
    el => window.getComputedStyle(el).fill
  );

  // Verify that all children of the same parent have the same branch color
  expect(anotherChildColor).toBe(firstBranchColor);
});
