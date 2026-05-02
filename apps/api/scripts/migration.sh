#!/bin/sh
# Wrapper for TypeORM migration commands that enforces module-based path convention.
#
# Usage:
#   pnpm migration:generate <module> <MigrationName>
#   pnpm migration:create   <module> <MigrationName>
#
# Examples:
#   pnpm migration:generate identity AddUserAvatarColumn
#   pnpm migration:create   books   CreateBooksTable

COMMAND=$1
MODULE=$2
NAME=$3

if [ -z "$MODULE" ] || [ -z "$NAME" ]; then
  echo ""
  echo "Error: missing required arguments."
  echo ""
  echo "Usage:   pnpm migration:$COMMAND <module> <MigrationName>"
  echo "Example: pnpm migration:$COMMAND identity AddUserAvatarColumn"
  echo ""
  exit 1
fi

exec pnpm typeorm "migration:$COMMAND" "src/module/$MODULE/migrations/$NAME"
