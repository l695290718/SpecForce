package orders

import "github.com/gin-gonic/gin"

type Order struct {
	ID string `json:"id" gorm:"primaryKey"`
}

func Register(router *gin.Engine) {
	router.POST("/orders", createOrder)
}

func createOrder(ctx *gin.Context) {
	db.Query("select 1")
	client.Do(req)
}
