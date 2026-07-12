package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo  *repository.UserRepo
	jwtSecret string
	logger    *slog.Logger
}

func NewAuthService(userRepo *repository.UserRepo, jwtSecret string, logger *slog.Logger) *AuthService {
	return &AuthService{userRepo: userRepo, jwtSecret: jwtSecret, logger: logger}
}

func (s *AuthService) Login(ctx context.Context, username, password string) (string, *model.User, error) {
	user, err := s.userRepo.GetByUsername(ctx, username)
	if err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":      user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	})

	tokenStr, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", nil, err
	}

	return tokenStr, user, nil
}

func (s *AuthService) SeedDefaultAdmin(ctx context.Context, username, password string) error {
	exists, err := s.userRepo.Exists(ctx)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	user := &model.User{
		ID:           util.GenerateUserID(),
		Username:     username,
		PasswordHash: string(hash),
	}

	s.logger.Info("seeding default admin user", "username", username)
	return s.userRepo.Create(ctx, user)
}

func (s *AuthService) GetUser(ctx context.Context, id string) (*model.User, error) {
	return s.userRepo.GetByID(ctx, id)
}
