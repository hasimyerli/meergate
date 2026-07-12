package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type UserRepo struct {
	db *pgxpool.Pool
}

func NewUserRepo(db *pgxpool.Pool) *UserRepo {
	return &UserRepo{db: db}
}

func (u *UserRepo) Create(ctx context.Context, user *model.User) error {
	_, err := u.db.Exec(ctx,
		`INSERT INTO users (id,username,password_hash) VALUES ($1,$2,$3)`,
		user.ID, user.Username, user.PasswordHash,
	)
	return err
}

func (u *UserRepo) GetByUsername(ctx context.Context, username string) (*model.User, error) {
	var user model.User
	err := u.db.QueryRow(ctx, "SELECT id,username,password_hash,created_at FROM users WHERE username=$1", username).
		Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (u *UserRepo) GetByID(ctx context.Context, id string) (*model.User, error) {
	var user model.User
	err := u.db.QueryRow(ctx, "SELECT id,username,password_hash,created_at FROM users WHERE id=$1", id).
		Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (u *UserRepo) Exists(ctx context.Context) (bool, error) {
	var count int
	if err := u.db.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}
