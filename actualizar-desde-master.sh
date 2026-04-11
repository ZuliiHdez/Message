#!/bin/bash

# ============================================================
#  SCRIPT TO PULL CHANGES FROM MASTER INTO YOUR BRANCH
#  Usage: ./actualizar-desde-master.sh
# ============================================================

# ▼▼▼ CHANGE THIS VALUE TO YOUR BRANCH NAME ▼▼▼
branchName="Yannick"
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
# ▼▼▼ CAMBIA ESTE VALOR POR EL NOMBRE DE TU RAMA ▼▼▼
nombreRama="Aythami"
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

# --- Colors for messages ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

echo ""
echo -e "${BLUE}============================================${RESET}"
echo -e "${BLUE}   UPDATE YOUR BRANCH FROM MASTER          ${RESET}"
echo -e "${BLUE}============================================${RESET}"
echo ""

# Check that the branch name has been configured
if [ -z "$branchName" ]; then
    echo -e "${RED}ERROR: You have not configured your branch name.${RESET}"
    echo -e "Open the file ${YELLOW}actualizar-desde-master.sh${RESET} and edit the variable ${YELLOW}branchName${RESET}."
    echo -e "Example: ${GREEN}branchName=\"ana\"${RESET}"
    echo ""
    exit 1
fi

echo -e "Working branch: ${GREEN}$branchName${RESET}"
echo -e "Changes will be pulled from: ${GREEN}master${RESET}"
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

# Step 2: Update your branch with the latest changes from the server
echo -e "${YELLOW}[2/4] Updating your branch with the latest changes from the server...${RESET}"
git pull origin "$branchName" 2>&1
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: There was a problem updating your branch.${RESET}"
    echo -e "Contact the project maintainer."
    echo ""
    exit 1
fi
echo -e "${GREEN}OK${RESET}"
echo ""

# Step 3: Download the latest changes from master
echo -e "${YELLOW}[3/4] Downloading the latest changes from master...${RESET}"
git fetch origin master 2>&1
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: Could not download the changes from master.${RESET}"
    echo -e "Check your internet connection."
    echo ""
    exit 1
fi
echo -e "${GREEN}OK${RESET}"
echo ""

# Step 4: Integrate the changes from master into your branch
echo -e "${YELLOW}[4/4] Integrating master changes into your branch '$branchName'...${RESET}"
git merge origin/master --no-edit 2>&1
MERGE_RESULT=$?

if [ $MERGE_RESULT -ne 0 ]; then
    echo ""
    echo -e "${RED}============================================${RESET}"
    echo -e "${RED}  CONFLICT DETECTED                         ${RESET}"
    echo -e "${RED}============================================${RESET}"
    echo ""
    echo -e "There are changes in master that conflict with your branch."
    echo -e "You need to resolve the conflict manually or ask for help."
    echo ""
    echo -e "Files with conflicts:"
    git diff --name-only --diff-filter=U
    echo ""
    echo -e "${YELLOW}To cancel the merge and go back to the previous state, run:${RESET}"
    echo -e "${BLUE}  git merge --abort${RESET}"
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}============================================${RESET}"
echo -e "${GREEN}  Your branch is up to date with master!   ${RESET}"
echo -e "${GREEN}============================================${RESET}"
echo ""
