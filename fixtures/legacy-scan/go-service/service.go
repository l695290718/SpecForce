package customer

import "net/http"

type Customer struct {
	ID string
}

type EventBus interface {
	Publish(any) error
}

func CreateCustomerHandler(w http.ResponseWriter, r *http.Request) {
	bus.Publish(Customer{})
	w.WriteHeader(http.StatusCreated)
}
