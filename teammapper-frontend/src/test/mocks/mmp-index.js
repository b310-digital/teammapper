module.exports = {
    Mmp: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        remove: jest.fn(),
        center: jest.fn(),
        new: jest.fn()
    }))
};