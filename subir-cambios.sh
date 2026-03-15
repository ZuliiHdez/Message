#!/bin/bash

# ============================================================
#  SCRIPT TO PUSH YOUR CHANGES TO YOUR PERSONAL BRANCH
#  Usage: ./subir-cambios.sh
# ============================================================

# ▼▼▼ CHANGE THIS VALUE TO YOUR BRANCH NAME ▼▼▼
branchName="Yannick"
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

# --- Colors for messages ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

echo ""
echo -e "${BLUE}============================================${RESET}"
echo -e "${BLUE}       PUSH CHANGES TO YOUR BRANCH         ${RESET}"
echo -e "${BLUE}============================================${RESET}"
echo ""

# Check that the branch name has been configured
if [ -z "$branchName" ]; then
    echo -e "${RED}ERROR: You have not configured your branch name.${RESET}"
    echo -e "Open the file ${YELLOW}subir-cambios.sh${RESET} and edit the variable ${YELLOW}branchName${RESET}."
    echo -e "Example: ${GREEN}branchName=\"ana\"${RESET}"
    echo ""
    exit 1
fi

echo -e "Working branch: ${GREEN}$branchName${RESET}"
echo ""

# Step 1: Make sure you are on the correct branch
echo -e "${YELLOW}[1/4] Switching to your branch '$branchName'...${RESET}"
git checkout "$branchName" 2>&1
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: Could not switch to branch '$branchName'.${RESET}"
    echo -e "Check that the branch name is correct."
    echo ""
    exit 1
fi
echo -e "${GREEN}OK${RESET}"
echo ""

# Step 2: Download the latest changes from the server
echo -e "${YELLOW}[2/4] Downloading the latest changes from the server...${RESET}"
git pull origin "$branchName" 2>&1
PULL_RESULT=$?

if [ $PULL_RESULT -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: There was a problem downloading the changes.${RESET}"
    echo -e "There may be a conflict. Contact the project maintainer."
    echo ""
    exit 1
fi
echo -e "${GREEN}OK - Branch updated${RESET}"
echo ""

# Step 3: See which files have changed
echo -e "${YELLOW}[3/4] Modified files:${RESET}"
git status --short
echo ""

# Check if there are changes to push
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}No new changes to push. Your branch is already up to date!${RESET}"
    echo ""
    exit 0
fi

# Ask for a commit message
echo -e "Write a short message describing what you did:"
echo -e "${BLUE}(Example: 'Add login screen', 'Fix bug in the menu')${RESET}"
echo -n "> "
read commitMessage

if [ -z "$commitMessage" ]; then
    echo ""
    echo -e "${RED}ERROR: The message cannot be empty.${RESET}"
    echo ""
    exit 1
fi

# Step 4: Save and push the changes
echo ""
echo -e "${YELLOW}[4/4] Saving and pushing the changes...${RESET}"

git add .
git commit -m "$commitMessage"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: Could not create the commit.${RESET}"
    echo ""
    exit 1
fi

git push origin "$branchName"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: Could not push to the server.${RESET}"
    echo -e "Check your internet connection or contact the project maintainer."
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}============================================${RESET}"
echo -e "${GREEN}  Changes pushed successfully!              ${RESET}"
echo -e "${GREEN}============================================${RESET}"
echo ""
